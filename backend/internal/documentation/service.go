package docs

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/internal/seocache"
	"github.com/skaia/backend/models"
)

var (
	ErrForbidden = errors.New("documentation operation forbidden")
	ErrNotFound  = errors.New("documentation resource not found")
	ErrInvalid   = errors.New("invalid documentation input")
	ErrConflict  = errors.New("documentation revision conflict")
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type Service struct {
	repo  Repository
	authz Authorizer
	rdb   *redis.Client
}

func NewService(repo Repository, authz Authorizer, rdb *redis.Client) *Service {
	return &Service{repo: repo, authz: authz, rdb: rdb}
}

func normalizeSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	dash := false
	for _, r := range value {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
			dash = false
		} else if b.Len() > 0 && !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func validSlug(slug string) bool {
	return len(slug) <= 120 && slugPattern.MatchString(slug) && slug != "mine" && slug != "id" && slug != "articles" && slug != "sections" && slug != "new"
}

func validText(value string, max int, required bool) bool {
	length := utf8.RuneCountInString(strings.TrimSpace(value))
	return (!required || length > 0) && length <= max
}

func validVisibility(value string) bool {
	return value == "public" || value == "unlisted" || value == "private"
}

func (s *Service) hasPermission(actorID int64, permission string) bool {
	if actorID <= 0 || s == nil || s.authz == nil {
		return false
	}
	ok, err := s.authz.HasPermission(actorID, permission)
	return err == nil && ok
}

func (s *Service) canManage(doc *models.Documentation, actorID int64) bool {
	return doc != nil && actorID > 0 && (doc.OwnerID == actorID || s.hasPermission(actorID, "docs.manage"))
}

func (s *Service) canView(doc *models.Documentation, actorID int64) bool {
	return doc != nil && (doc.Visibility == "public" || doc.Visibility == "unlisted" || s.canManage(doc, actorID))
}

func (s *Service) decorate(doc *models.Documentation, actorID int64) *models.Documentation {
	if doc != nil {
		doc.CanEdit = s.canManage(doc, actorID)
	}
	return doc
}

func (s *Service) invalidate(routes ...string) {
	for _, route := range routes {
		_ = seocache.InvalidateRoute(context.Background(), s.rdb, route)
	}
	_ = seocache.InvalidateSitemap(context.Background(), s.rdb)
}

func (s *Service) ListPublic(actorID int64) ([]models.Documentation, error) {
	docs, err := s.repo.ListPublic()
	if err != nil {
		return nil, err
	}
	for i := range docs {
		s.decorate(&docs[i], actorID)
	}
	return docs, nil
}

func (s *Service) ListOwned(actorID int64) ([]models.Documentation, error) {
	if actorID <= 0 {
		return nil, ErrForbidden
	}
	var docs []models.Documentation
	var err error
	if s.hasPermission(actorID, "docs.manage") {
		docs, err = s.repo.ListAll()
	} else {
		docs, err = s.repo.ListOwned(actorID)
	}
	if err != nil {
		return nil, err
	}
	for i := range docs {
		docs[i].CanEdit = true
	}
	return docs, nil
}

func (s *Service) GetByID(id, actorID int64) (*models.Documentation, error) {
	doc, err := s.repo.GetByID(id)
	if err != nil || !s.canView(doc, actorID) {
		return nil, ErrNotFound
	}
	return s.decorate(doc, actorID), nil
}

func (s *Service) Manifest(slug string, actorID int64) (*models.DocumentationManifest, error) {
	doc, err := s.repo.GetBySlug(slug)
	if err != nil || !s.canView(doc, actorID) {
		return nil, ErrNotFound
	}
	manifest, err := s.repo.Manifest(doc.ID)
	if err != nil {
		return nil, err
	}
	manifest.Documentation = s.decorate(manifest.Documentation, actorID)
	return manifest, nil
}

func (s *Service) Article(documentationSlug, articleSlug string, actorID int64) (*models.DocumentationArticleView, error) {
	manifest, err := s.Manifest(documentationSlug, actorID)
	if err != nil {
		return nil, err
	}
	article, err := s.repo.GetArticleBySlug(manifest.Documentation.ID, articleSlug)
	if err != nil {
		return nil, ErrNotFound
	}
	view := &models.DocumentationArticleView{Article: article}
	for i := range manifest.Articles {
		if manifest.Articles[i].ID != article.ID {
			continue
		}
		if i > 0 {
			prev := manifest.Articles[i-1]
			view.Previous = &prev
		}
		if i+1 < len(manifest.Articles) {
			next := manifest.Articles[i+1]
			view.Next = &next
		}
		break
	}
	return view, nil
}

func (s *Service) Create(doc *models.Documentation, actorID int64) error {
	if !s.hasPermission(actorID, "docs.create") {
		return ErrForbidden
	}
	doc.Slug = normalizeSlug(doc.Slug)
	doc.Title = strings.TrimSpace(doc.Title)
	doc.Description = strings.TrimSpace(doc.Description)
	if doc.Visibility == "" {
		doc.Visibility = "public"
	}
	if !validSlug(doc.Slug) || !validText(doc.Title, 255, true) || !validText(doc.Description, 2000, false) || !validVisibility(doc.Visibility) {
		return ErrInvalid
	}
	doc.OwnerID = actorID
	if err := s.repo.Create(doc); err != nil {
		return err
	}
	doc.CanEdit = true
	s.invalidate("/doc", "/doc/"+doc.Slug)
	return nil
}

func (s *Service) Update(doc *models.Documentation, actorID, expectedRevision int64) error {
	current, err := s.repo.GetByID(doc.ID)
	if err != nil || !s.canManage(current, actorID) {
		return ErrForbidden
	}
	doc.Slug = normalizeSlug(doc.Slug)
	doc.Title = strings.TrimSpace(doc.Title)
	doc.Description = strings.TrimSpace(doc.Description)
	if !validSlug(doc.Slug) || !validText(doc.Title, 255, true) || !validText(doc.Description, 2000, false) || !validVisibility(doc.Visibility) {
		return ErrInvalid
	}
	if err = s.repo.Update(doc, expectedRevision); err != nil {
		return err
	}
	doc.CanEdit = true
	s.invalidate("/doc", "/doc/"+current.Slug, "/doc/"+doc.Slug)
	return nil
}

func (s *Service) Delete(id, actorID int64) error {
	doc, err := s.repo.GetByID(id)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	if err = s.repo.Delete(id, actorID); err == nil {
		s.invalidate("/doc", "/doc/"+doc.Slug)
	}
	return err
}

func (s *Service) CreateSection(section *models.DocumentationSection, actorID int64) error {
	doc, err := s.repo.GetByID(section.DocumentationID)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	section.Title = strings.TrimSpace(section.Title)
	if !validText(section.Title, 255, true) {
		return ErrInvalid
	}
	if err = s.repo.CreateSection(section); err == nil {
		s.invalidate("/doc/" + doc.Slug)
	}
	return err
}

func (s *Service) UpdateSection(section *models.DocumentationSection, actorID int64) error {
	current, err := s.repo.GetSection(section.ID)
	if err != nil {
		return ErrNotFound
	}
	doc, err := s.repo.GetByID(current.DocumentationID)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	section.Title = strings.TrimSpace(section.Title)
	if !validText(section.Title, 255, true) {
		return ErrInvalid
	}
	if err = s.repo.UpdateSection(section); err == nil {
		s.invalidate("/doc/" + doc.Slug)
	}
	return err
}

func (s *Service) DeleteSection(id, actorID int64) error {
	section, err := s.repo.GetSection(id)
	if err != nil {
		return ErrNotFound
	}
	doc, err := s.repo.GetByID(section.DocumentationID)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	if err = s.repo.DeleteSection(id, actorID); err == nil {
		s.invalidate("/doc/" + doc.Slug)
	}
	return err
}

func prepareArticle(article *models.DocumentationArticle) error {
	article.Slug = normalizeSlug(article.Slug)
	article.Title = strings.TrimSpace(article.Title)
	article.Summary = strings.TrimSpace(article.Summary)
	if !validSlug(article.Slug) || !validText(article.Title, 255, true) || !validText(article.Summary, 2000, false) || !validText(article.Content, 500000, true) {
		return ErrInvalid
	}
	return nil
}

func (s *Service) CreateArticle(article *models.DocumentationArticle, actorID int64) error {
	doc, err := s.repo.GetByID(article.DocumentationID)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	if err = prepareArticle(article); err != nil {
		return err
	}
	article.AuthorID = actorID
	article.LastEditedBy = actorID
	if err = s.repo.CreateArticle(article); err == nil {
		s.invalidate("/doc/"+doc.Slug, "/doc/"+doc.Slug+"/"+article.Slug)
	}
	return err
}

func (s *Service) UpdateArticle(article *models.DocumentationArticle, actorID, expectedRevision int64) error {
	current, err := s.repo.GetArticleByID(article.ID)
	if err != nil {
		return ErrNotFound
	}
	doc, err := s.repo.GetByID(current.DocumentationID)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	if err = prepareArticle(article); err != nil {
		return err
	}
	article.LastEditedBy = actorID
	if err = s.repo.UpdateArticle(article, expectedRevision); err == nil {
		s.invalidate("/doc/"+doc.Slug, "/doc/"+doc.Slug+"/"+current.Slug, "/doc/"+doc.Slug+"/"+article.Slug)
	}
	return err
}

func (s *Service) DeleteArticle(id, actorID int64) error {
	article, err := s.repo.GetArticleByID(id)
	if err != nil {
		return ErrNotFound
	}
	doc, err := s.repo.GetByID(article.DocumentationID)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	if err = s.repo.DeleteArticle(id, actorID); err == nil {
		s.invalidate("/doc/"+doc.Slug, "/doc/"+doc.Slug+"/"+article.Slug)
	}
	return err
}

func (s *Service) Reorder(documentationID, actorID int64, order NavigationOrder) error {
	doc, err := s.repo.GetByID(documentationID)
	if err != nil || !s.canManage(doc, actorID) {
		return ErrForbidden
	}
	if len(order.Sections) > 1000 || len(order.Articles) > 10000 {
		return ErrInvalid
	}
	if err = s.repo.Reorder(documentationID, order); err == nil {
		s.invalidate("/doc/" + doc.Slug)
	}
	return err
}

func (s *Service) Search(slug, query string, actorID int64) ([]models.DocumentationSearchResult, error) {
	manifest, err := s.Manifest(slug, actorID)
	if err != nil {
		return nil, err
	}
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) < 2 || utf8.RuneCountInString(query) > 120 {
		return []models.DocumentationSearchResult{}, nil
	}
	return s.repo.Search(manifest.Documentation.ID, query, 20)
}

func (s *Service) CanViewDocumentation(documentationID, actorID int64) error {
	doc, err := s.repo.GetByID(documentationID)
	if err != nil || !s.canView(doc, actorID) {
		return ErrForbidden
	}
	return nil
}

func (s *Service) CanViewArticle(articleID, actorID int64) error {
	article, err := s.repo.GetArticleByID(articleID)
	if err != nil {
		return ErrForbidden
	}
	return s.CanViewDocumentation(article.DocumentationID, actorID)
}

func statusError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
