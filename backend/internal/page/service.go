package page

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/internal/s_registry"
	"github.com/skaia/backend/internal/seocache"
	log "github.com/skaia/backend/internal/syslog"
	"github.com/skaia/backend/models"
)

var ErrInvalidContent = errors.New("invalid page content")
var ErrInvalidSEO = errors.New("invalid page SEO")
var ErrInvalidBrowseCursor = errors.New("invalid page browse cursor")
var ErrPageForbidden = errors.New("page forbidden")

const (
	DefaultBrowseLimit = 24
	MaxBrowseLimit     = 100
)

type BrowseRequest struct {
	Limit        int
	Query        string
	Cursor       string
	ActorID      int64
	IsAdmin      bool
	CanDeleteAll bool
}

type BrowseResponse struct {
	Pages      []*models.PageBrowseSummary `json:"pages"`
	NextCursor string                      `json:"next_cursor,omitempty"`
	HasMore    bool                        `json:"has_more"`
}

type browseCursorPayload struct {
	UpdatedAt int64 `json:"updated_at"`
	ID        int64 `json:"id"`
}

type DataSourceGetter interface {
	GetByID(id int64) (*models.DataSource, error)
}

type CustomSectionGetter interface {
	GetByID(id int64) (*models.CustomSection, error)
}

type InteractivePolicy interface {
	RequireInteractiveResponseManager(pageID, actorID int64) error
}

type contentResolver struct {
	dataSources    DataSourceGetter
	customSections CustomSectionGetter
}

func (r contentResolver) DataSourceExists(id int64) (bool, error) {
	if r.dataSources == nil {
		return true, nil
	}
	ds, err := r.dataSources.GetByID(id)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return false, err
		}
		return false, nil
	}
	return ds != nil, nil
}

func (r contentResolver) CustomSectionExists(id int64) (bool, error) {
	if r.customSections == nil {
		return true, nil
	}
	cs, err := r.customSections.GetByID(id)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return false, err
		}
		return false, nil
	}
	return cs != nil, nil
}

type Option func(*Service)

func WithIntegrationResolvers(dataSources DataSourceGetter, customSections CustomSectionGetter) Option {
	return func(s *Service) {
		s.contentResolver = contentResolver{
			dataSources:    dataSources,
			customSections: customSections,
		}
	}
}

func WithRedisClient(rdb *redis.Client) Option {
	return func(s *Service) {
		s.rdb = rdb
	}
}

func WithInteractivePolicy(policy InteractivePolicy) Option {
	return func(s *Service) {
		s.interactivePolicy = policy
	}
}

// Service wraps the page repository with business logic.
type Service struct {
	repo              Repository
	inboxSender       models.InboxSender
	contentResolver   s_registry.Resolver
	rdb               *redis.Client
	interactivePolicy InteractivePolicy
}

// NewService creates a new page Service.
func NewService(repo Repository, inboxSender models.InboxSender, opts ...Option) *Service {
	s := &Service{repo: repo, inboxSender: inboxSender}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

func (s *Service) GetBySlug(slug string) (*models.Page, error) {
	return s.repo.GetBySlug(slug)
}

func (s *Service) GetByID(id int64) (*models.Page, error) {
	return s.repo.GetByID(id)
}

func (s *Service) List() ([]*models.Page, error) {
	return s.repo.List()
}

func decodeBrowseCursor(value string) (*BrowseCursor, error) {
	if value == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, ErrInvalidBrowseCursor
	}
	var payload browseCursorPayload
	if err := json.Unmarshal(raw, &payload); err != nil || payload.UpdatedAt <= 0 || payload.ID <= 0 {
		return nil, ErrInvalidBrowseCursor
	}
	return &BrowseCursor{UpdatedAt: time.Unix(0, payload.UpdatedAt).UTC(), ID: payload.ID}, nil
}

func encodeBrowseCursor(cursor BrowseCursor) string {
	raw, _ := json.Marshal(browseCursorPayload{UpdatedAt: cursor.UpdatedAt.UnixNano(), ID: cursor.ID})
	return base64.RawURLEncoding.EncodeToString(raw)
}

func (s *Service) BrowsePages(request BrowseRequest) (*BrowseResponse, error) {
	if request.Limit <= 0 {
		request.Limit = DefaultBrowseLimit
	}
	if request.Limit > MaxBrowseLimit {
		request.Limit = MaxBrowseLimit
	}
	cursor, err := decodeBrowseCursor(request.Cursor)
	if err != nil {
		return nil, err
	}
	result, err := s.repo.BrowsePages(BrowseOptions{
		Limit:   request.Limit,
		Query:   strings.TrimSpace(request.Query),
		Cursor:  cursor,
		ActorID: request.ActorID,
		IsAdmin: request.IsAdmin,
	})
	if err != nil {
		return nil, err
	}
	if result == nil {
		result = &BrowseResult{}
	}
	if result.Pages == nil {
		result.Pages = []*models.PageBrowseSummary{}
	}
	if len(result.Pages) > request.Limit {
		result.Pages = result.Pages[:request.Limit]
		result.HasMore = true
	}
	for _, page := range result.Pages {
		if page == nil {
			continue
		}
		isOwner := page.OwnerID != nil && *page.OwnerID == request.ActorID
		isEditor := false
		for _, editor := range page.Editors {
			if editor != nil && editor.ID == request.ActorID {
				isEditor = true
				break
			}
		}
		page.CanEdit = request.IsAdmin || isOwner || isEditor
		page.CanDelete = request.IsAdmin || request.CanDeleteAll || isOwner
	}
	response := &BrowseResponse{Pages: result.Pages, HasMore: result.HasMore}
	if result.HasMore && len(result.Pages) > 0 {
		last := result.Pages[len(result.Pages)-1]
		response.NextCursor = encodeBrowseCursor(BrowseCursor{UpdatedAt: last.UpdatedAt, ID: last.ID})
	}
	return response, nil
}

// GetPreview returns only the authorized, sanitized document needed by an
// intent-activated browse card. Private access is enforced here, not only by
// the handler.
func (s *Service) GetPreview(pageID, actorID int64, isAdmin bool) (*models.PagePreview, error) {
	page, err := s.repo.GetByID(pageID)
	if err != nil {
		return nil, err
	}
	canManage := isAdmin || (page.OwnerID != nil && *page.OwnerID == actorID)
	if !canManage && actorID > 0 {
		isEditor, editorErr := s.repo.IsEditor(pageID, actorID)
		if editorErr == nil {
			canManage = isEditor
		} else if page.Visibility == "private" {
			return nil, ErrPageForbidden
		}
	}
	if page.Visibility == "private" && !canManage {
		return nil, ErrPageForbidden
	}
	s.SanitizeInteractivePage(page, actorID, canManage)
	return &models.PagePreview{ID: page.ID, Content: page.Content, UpdatedAt: page.UpdatedAt}, nil
}

func (s *Service) DeleteAll(actorID int64) error {
	return s.repo.DeleteAll(actorID)
}

func (s *Service) invalidateSEO(slug string) {
	if s.rdb == nil {
		return
	}
	// Any custom page may currently be selected as the landing page. Evicting
	// the root alongside its direct route keeps homepage metadata fresh without
	// adding a second configuration lookup to every page mutation.
	routes := []string{"/page/" + slug, "/"}
	if slug == "privacy" || slug == "tos" {
		routes = append(routes, "/"+slug)
	}
	for _, route := range routes {
		if err := seocache.InvalidateRoute(context.Background(), s.rdb, route); err != nil {
			log.Printf("page: invalidate SEO cache for %q: %v", route, err)
		}
	}
	if err := seocache.InvalidateSitemap(context.Background(), s.rdb); err != nil {
		log.Printf("page: invalidate sitemap cache: %v", err)
	}
}

func (s *Service) Create(p *models.Page) error {
	if p.Content == "" {
		p.Content = "[]"
	}
	if p.Visibility == "" {
		p.Visibility = "public"
	}
	p.Content = ClearInteractiveRecords(p.Content)
	if err := normalizePageSEO(p); err != nil {
		return err
	}
	if err := s.validateContent(p.Content); err != nil {
		return err
	}
	if err := s.repo.Create(p); err != nil {
		return err
	}
	s.invalidateSEO(p.Slug)
	return nil
}

func (s *Service) Update(p *models.Page) error {
	if p.Content == "" {
		p.Content = "[]"
	}
	p.Content = ClearInteractiveRecords(p.Content)
	if err := normalizePageSEO(p); err != nil {
		return err
	}
	current, err := s.repo.GetByID(p.ID)
	if err != nil {
		return err
	}
	if err := s.validateContent(p.Content); err != nil {
		return err
	}
	err = s.repo.UpdatePreservingInteractive(p)
	if err == nil {
		if current.Slug != p.Slug {
			s.invalidateSEO(current.Slug)
		}
		s.invalidateSEO(p.Slug)
	}
	return err
}

func (s *Service) UpdateSEO(pageID int64, title, description, image string) (*models.Page, error) {
	p, err := s.repo.GetByID(pageID)
	if err != nil {
		return nil, err
	}
	p.SEOTitle = title
	p.SEODesc = description
	p.SEOImage = image
	if err := normalizePageSEO(p); err != nil {
		return nil, err
	}
	if err := s.repo.UpdateSEO(pageID, p.SEOTitle, p.SEODesc, p.SEOImage); err != nil {
		return nil, err
	}
	s.invalidateSEO(p.Slug)
	return s.repo.GetByID(pageID)
}

func (s *Service) validateContent(content string) error {
	if err := s_registry.ValidateContent(content, s.contentResolver); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidContent, err)
	}
	return nil
}

// Duplicate creates a copy of an existing page under a new slug.
func (s *Service) Duplicate(fromID int64, newSlug, newTitle string) (*models.Page, error) {
	src, err := s.GetByID(fromID)
	if err != nil {
		return nil, fmt.Errorf("source page not found: %w", err)
	}
	title := newTitle
	if title == "" {
		title = src.Title + " (copy)"
	}
	dup := &models.Page{
		Slug:        newSlug,
		Title:       title,
		Description: src.Description,
		SEOTitle:    src.SEOTitle,
		SEODesc:     src.SEODesc,
		SEOImage:    src.SEOImage,
		Content:     ClearInteractiveRecords(src.Content),
		Visibility:  "private",
	}
	if dup.Content == "" {
		dup.Content = "[]"
	}
	if err := s.repo.Create(dup); err != nil {
		return nil, err
	}
	s.invalidateSEO(dup.Slug)
	return dup, nil
}

func normalizePageSEO(p *models.Page) error {
	p.SEOTitle = strings.TrimSpace(p.SEOTitle)
	p.SEODesc = strings.TrimSpace(p.SEODesc)
	p.SEOImage = strings.TrimSpace(p.SEOImage)
	if len([]rune(p.SEOTitle)) > 255 {
		return fmt.Errorf("%w: title must be 255 characters or fewer", ErrInvalidSEO)
	}
	if len([]rune(p.SEODesc)) > 500 {
		return fmt.Errorf("%w: description must be 500 characters or fewer", ErrInvalidSEO)
	}
	if len(p.SEOImage) > 2048 {
		return fmt.Errorf("%w: image URL is too long", ErrInvalidSEO)
	}
	if p.SEOImage != "" && !strings.HasPrefix(p.SEOImage, "/") &&
		!strings.HasPrefix(p.SEOImage, "https://") && !strings.HasPrefix(p.SEOImage, "http://") {
		return fmt.Errorf("%w: image must use an uploaded, HTTP, or HTTPS URL", ErrInvalidSEO)
	}
	return nil
}

func (s *Service) Delete(id, actorID int64) error {
	// Look up the page owner so we can decrement their allocation.
	p, err := s.repo.GetByID(id)
	if err != nil {
		return s.repo.Delete(id, actorID)
	}
	if err := s.repo.Delete(id, actorID); err != nil {
		return err
	}
	s.invalidateSEO(p.Slug)
	if p.OwnerID != nil && *p.OwnerID > 0 {
		_ = s.repo.DecrementUsed(*p.OwnerID)
	}
	return nil
}

// Ownership & editors
func (s *Service) SetOwner(pageID, ownerID int64) error {
	return s.repo.SetOwner(pageID, ownerID)
}

func (s *Service) ClearOwner(pageID int64) error {
	return s.repo.ClearOwner(pageID)
}

func (s *Service) AddEditor(pageID, userID, grantedBy int64) error {
	return s.repo.AddEditor(pageID, userID, grantedBy)
}

func (s *Service) RemoveEditor(pageID, userID int64) error {
	return s.repo.RemoveEditor(pageID, userID)
}

func (s *Service) GetEditors(pageID int64) ([]*models.PageUser, error) {
	return s.repo.GetEditors(pageID)
}

func (s *Service) GetOwner(pageID int64) (*models.PageUser, error) {
	return s.repo.GetOwner(pageID)
}

func (s *Service) IsEditor(pageID, userID int64) (bool, error) {
	return s.repo.IsEditor(pageID, userID)
}

// EnrichPage populates Owner and Editors on the given page.
func (s *Service) EnrichPage(p *models.Page) {
	if p == nil {
		return
	}
	if owner, err := s.repo.GetOwner(p.ID); err == nil {
		p.Owner = owner
	}
	if editors, err := s.repo.GetEditors(p.ID); err == nil {
		p.Editors = editors
	}

	if p.Editors == nil {
		p.Editors = []*models.PageUser{}
	}
}

// CanEdit returns true if the user can edit the page (admin, owner, or editor).
func (s *Service) CanEdit(pageID, userID int64, isAdmin bool) bool {
	if isAdmin {
		return true
	}
	page, err := s.repo.GetByID(pageID)
	if err != nil {
		return false
	}
	if page.OwnerID != nil && *page.OwnerID == userID {
		return true
	}
	isEd, _ := s.repo.IsEditor(pageID, userID)
	return isEd
}

// CanDelete returns true if the user can delete the page (admin or owner).
func (s *Service) CanDelete(pageID, userID int64, isAdmin bool) bool {
	if isAdmin {
		return true
	}
	page, err := s.repo.GetByID(pageID)
	if err != nil {
		return false
	}
	return page.OwnerID != nil && *page.OwnerID == userID
}

// Engagement
func (s *Service) LikePage(pageID, userID int64) (int64, error) {
	return s.repo.LikePage(pageID, userID)
}

func (s *Service) UnlikePage(pageID, userID int64) (int64, error) {
	return s.repo.UnlikePage(pageID, userID)
}

func (s *Service) IsPageLikedByUser(pageID, userID int64) (bool, error) {
	return s.repo.IsPageLikedByUser(pageID, userID)
}

func (s *Service) GetPageLikeCount(pageID int64) (int, error) {
	return s.repo.GetPageLikeCount(pageID)
}

func (s *Service) GetPageCommentCount(pageID int64) (int, error) {
	return s.repo.GetPageCommentCount(pageID)
}

// EnrichPageEngagement populates Likes, IsLiked, CommentCount on a page for the given user.
func (s *Service) EnrichPageEngagement(p *models.Page, userID *int64) {
	if p == nil {
		return
	}
	if likes, err := s.repo.GetPageLikeCount(p.ID); err == nil {
		p.Likes = likes
	}
	if cc, err := s.repo.GetPageCommentCount(p.ID); err == nil {
		p.CommentCount = cc
	}
	if userID != nil {
		if liked, err := s.repo.IsPageLikedByUser(p.ID, *userID); err == nil {
			p.IsLiked = liked
		}
	}
}

// Comments
func (s *Service) CreateComment(c *models.PageComment) (*models.PageComment, error) {
	return s.repo.CreateComment(c)
}

func (s *Service) GetComment(id int64) (*models.PageComment, error) {
	return s.repo.GetComment(id)
}

func (s *Service) ListComments(pageID int64, limit, offset int) ([]*models.PageComment, error) {
	return s.repo.ListComments(pageID, limit, offset)
}

func (s *Service) UpdateComment(c *models.PageComment) error {
	return s.repo.UpdateComment(c)
}

func (s *Service) DeleteComment(id, actorID int64) error {
	return s.repo.DeleteComment(id, actorID)
}

func (s *Service) LikeComment(commentID, userID int64) (int64, error) {
	return s.repo.LikeComment(commentID, userID)
}

func (s *Service) UnlikeComment(commentID, userID int64) (int64, error) {
	return s.repo.UnlikeComment(commentID, userID)
}

func (s *Service) IsCommentLikedByUser(commentID, userID int64) (bool, error) {
	return s.repo.IsCommentLikedByUser(commentID, userID)
}

// Page allocations
func (s *Service) GetAllocation(userID int64) (*models.UserPageAllocation, error) {
	return s.repo.GetAllocation(userID)
}

func (s *Service) UpsertAllocation(userID, maxPages int64) error {
	return s.repo.UpsertAllocation(userID, maxPages)
}

func (s *Service) ListAllocations() ([]*models.UserPageAllocation, error) {
	return s.repo.ListAllocations()
}

func (s *Service) DeleteAllocation(userID int64) error {
	return s.repo.DeleteAllocation(userID)
}

// ClaimPage creates a new page for a user, consuming one allocation slot.
// Admins bypass allocation checks entirely and never consume a slot.
func (s *Service) ClaimPage(userID int64, slug string, isAdmin bool) (*models.Page, error) {
	if !isAdmin {
		alloc, err := s.repo.GetAllocation(userID)
		if err != nil {
			return nil, fmt.Errorf("no page allocation found - you have not been granted any custom pages")
		}
		if alloc.UsedPages >= alloc.MaxPages {
			return nil, fmt.Errorf("page limit reached (%d/%d)", alloc.UsedPages, alloc.MaxPages)
		}
	}

	p := &models.Page{
		Slug:    slug,
		Title:   "",
		Content: "[]",
		OwnerID: &userID,
	}
	if err := s.repo.Create(p); err != nil {
		return nil, err
	}
	if err := s.repo.SetOwner(p.ID, userID); err != nil {
		return nil, err
	}
	if !isAdmin {
		if err := s.repo.IncrementUsed(userID); err != nil {
			return nil, err
		}
	}
	return p, nil
}

// SendPageCreatedInbox sends an inbox DM from the noreply system user
// to the page owner with a rich-text card about their new page.
func (s *Service) SendPageCreatedInbox(ownerID int64, page *models.Page) {
	if s.inboxSender == nil {
		return
	}

	title := page.Title
	if title == "" {
		title = page.Slug
	}
	route := "/page/" + page.Slug
	cardJSON, _ := json.Marshal(map[string]string{
		"title":       title,
		"description": page.Description,
		"slug":        page.Slug,
		"route":       route,
	})
	_ = s.inboxSender.SendSystemMessage(ownerID, string(cardJSON), "page_card")
}

// ReconcileUsedCount re-syncs used_pages with the actual COUNT of owned pages.
func (s *Service) ReconcileUsedCount(userID int64) error {
	actual, err := s.repo.CountOwnedPages(userID)
	if err != nil {
		return err
	}
	_, allocErr := s.repo.GetAllocation(userID)
	if allocErr != nil {
		return nil
	}
	return s.repo.SetUsedPages(userID, actual)
}
