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
