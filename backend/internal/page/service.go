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
