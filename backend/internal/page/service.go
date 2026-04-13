package page

import "github.com/skaia/backend/models"

// Service wraps the page repository with business logic.
type Service struct {
	repo Repository
}

// NewService creates a new page Service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetBySlug(slug string) (*models.Page, error) {
	return s.repo.GetBySlug(slug)
}

func (s *Service) GetIndex() (*models.Page, error) {
	return s.repo.GetIndex()
}

func (s *Service) GetByID(id int64) (*models.Page, error) {
	return s.repo.GetByID(id)
}

func (s *Service) List() ([]*models.Page, error) {
	return s.repo.List()
}

func (s *Service) Create(p *models.Page) error {
	if p.Content == "" {
		p.Content = "[]"
	}
	return s.repo.Create(p)
}

func (s *Service) Update(p *models.Page) error {
	if p.Content == "" {
		p.Content = "[]"
	}
	return s.repo.Update(p)
}

func (s *Service) Delete(id int64) error {
	return s.repo.Delete(id)
}

// ── Ownership & editors ─────────────────────────────────────────────────────

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

// ── Engagement ──────────────────────────────────────────────────────────────

func (s *Service) RecordView(pageID int64, userID *int64) error {
	return s.repo.RecordView(pageID, userID)
}

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

// ── Comments ────────────────────────────────────────────────────────────────

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
