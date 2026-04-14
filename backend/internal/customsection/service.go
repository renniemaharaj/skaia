package customsection

import "github.com/skaia/backend/models"

// Service wraps the custom section repository with business logic.
type Service struct {
	repo Repository
}

// NewService creates a new custom section Service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetByID(id int64) (*models.CustomSection, error) {
	return s.repo.GetByID(id)
}

func (s *Service) List() ([]*models.CustomSection, error) {
	return s.repo.List()
}

func (s *Service) ListByDataSource(datasourceID int64) ([]*models.CustomSection, error) {
	return s.repo.ListByDataSource(datasourceID)
}

func (s *Service) Create(cs *models.CustomSection) error {
	return s.repo.Create(cs)
}

func (s *Service) Update(cs *models.CustomSection) error {
	return s.repo.Update(cs)
}

func (s *Service) Delete(id int64) error {
	return s.repo.Delete(id)
}
