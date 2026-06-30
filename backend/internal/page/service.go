package page

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/internal/s_registry"
	"github.com/skaia/backend/models"
)

var ErrInvalidContent = errors.New("invalid page content")

type DataSourceGetter interface {
	GetByID(id int64) (*models.DataSource, error)
}

type CustomSectionGetter interface {
	GetByID(id int64) (*models.CustomSection, error)
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

// Service wraps the page repository with business logic.
type Service struct {
	repo            Repository
	inboxSender     models.InboxSender
	contentResolver s_registry.Resolver
	rdb             *redis.Client
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

func (s *Service) DeleteAll() error {
	return s.repo.DeleteAll()
}

func (s *Service) invalidateSEO(slug string) {
	if s.rdb == nil {
		return
	}
	name := os.Getenv("CLIENT_NAME")
	if name != "" {
		name = name + ":"
	}
	seoKey := name + "ssr:meta:/page/" + slug
	s.rdb.Del(context.Background(), seoKey)
}

func (s *Service) Create(p *models.Page) error {
	if p.Content == "" {
		p.Content = "[]"
	}
	if p.Visibility == "" {
		p.Visibility = "public"
	}
	if err := s.validateContent(p.Content); err != nil {
		return err
	}
	return s.repo.Create(p)
}

func (s *Service) Update(p *models.Page) error {
	if p.Content == "" {
		p.Content = "[]"
	}
	if err := s.validateContent(p.Content); err != nil {
		return err
	}
	err := s.repo.Update(p)
	if err == nil {
		s.invalidateSEO(p.Slug)
	}
	return err
}

func (s *Service) validateContent(content string) error {
	if err := s_registry.ValidateContent(content, s.contentResolver); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidContent, err)
	}
	return nil
}

// Duplicate creates a copy of an existing page under a new slug.
func (s *Service) Duplicate(fromID int64, newSlug, newTitle string) (*models.Page, error) {
	src, err := s.repo.GetByID(fromID)
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
		Content:     src.Content,
		Visibility:  "private",
	}
	if dup.Content == "" {
		dup.Content = "[]"
	}
	if err := s.repo.Create(dup); err != nil {
		return nil, err
	}
	return dup, nil
}

func (s *Service) Delete(id int64) error {
	// Look up the page owner so we can decrement their allocation.
	p, err := s.repo.GetByID(id)
	if err != nil {
		return s.repo.Delete(id)
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
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

func (s *Service) ListWithOwnership() ([]*models.Page, error) {
	return s.repo.ListWithOwnership()
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

func (s *Service) DeleteComment(id int64) error {
	return s.repo.DeleteComment(id)
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
			return nil, fmt.Errorf("no page allocation found — you have not been granted any custom pages")
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
