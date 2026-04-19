package datasource

import "github.com/skaia/backend/models"

// Service wraps the datasource repository with business logic.
type Service struct {
	repo Repository
}

// NewService creates a new datasource Service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetByID(id int64) (*models.DataSource, error) {
	return s.repo.GetByID(id)
}

func (s *Service) List() ([]*models.DataSource, error) {
	return s.repo.List()
}

func (s *Service) Create(ds *models.DataSource) error {
	return s.repo.Create(ds)
}

func (s *Service) Update(ds *models.DataSource) error {
	return s.repo.Update(ds)
}

func (s *Service) Delete(id int64) error {
	return s.repo.Delete(id)
}

func (s *Service) GetEnvData(id int64) (string, error) {
	return s.repo.GetEnvData(id)
}

func (s *Service) UpdateEnvData(id int64, envData string) error {
	return s.repo.UpdateEnvData(id, envData)
}
