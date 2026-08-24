package datasource

import (
	"errors"

	"github.com/skaia/backend/models"
)

var ErrManagementForbidden = errors.New("datasource management forbidden")

type ManagementPolicy interface {
	HasPermission(userID int64, permission string) (bool, error)
}

// Service wraps the datasource repository with business logic.
type Service struct {
	repo   Repository
	policy ManagementPolicy
}

// NewService creates a new datasource Service.
func NewService(repo Repository, policy ...ManagementPolicy) *Service {
	service := &Service{repo: repo}
	if len(policy) > 0 {
		service.policy = policy[0]
	}
	return service
}

// RequireManage enforces the database-backed datasource management policy.
// Missing policy dependencies and lookup failures deny access.
func (s *Service) RequireManage(actorID int64) error {
	if s == nil || s.policy == nil || actorID <= 0 {
		return ErrManagementForbidden
	}
	allowed, err := s.policy.HasPermission(actorID, "home.manage")
	if err != nil || !allowed {
		return ErrManagementForbidden
	}
	return nil
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

func (s *Service) Delete(id, actorID int64) error {
	return s.repo.Delete(id, actorID)
}

func (s *Service) GetEnvData(id int64) (string, error) {
	return s.repo.GetEnvData(id)
}

func (s *Service) UpdateEnvData(id int64, envData string) error {
	return s.repo.UpdateEnvData(id, envData)
}
