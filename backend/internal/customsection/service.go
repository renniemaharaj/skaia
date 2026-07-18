package customsection

import (
	"errors"

	"github.com/skaia/backend/models"
)

var ErrPresetMutationForbidden = errors.New("section preset mutation forbidden")

type MutationPolicy interface {
	HasPermission(userID int64, permission string) (bool, error)
}

// Service wraps the custom section repository with business logic.
type Service struct {
	repo   Repository
	policy MutationPolicy
}

// NewService creates a new custom section Service.
func NewService(repo Repository, policy ...MutationPolicy) *Service {
	service := &Service{repo: repo}
	if len(policy) > 0 {
		service.policy = policy[0]
	}
	return service
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

func (s *Service) requireMutation(actorID int64) error {
	if s == nil || s.policy == nil || actorID <= 0 {
		return ErrPresetMutationForbidden
	}
	allowed, err := s.policy.HasPermission(actorID, "home.manage")
	if err != nil || !allowed {
		return ErrPresetMutationForbidden
	}
	return nil
}

func (s *Service) Create(actorID int64, cs *models.CustomSection) error {
	if err := s.requireMutation(actorID); err != nil {
		return err
	}
	return s.repo.Create(cs)
}

func (s *Service) Update(actorID int64, cs *models.CustomSection) error {
	if err := s.requireMutation(actorID); err != nil {
		return err
	}
	return s.repo.Update(cs)
}

func (s *Service) Delete(actorID, id int64) error {
	if err := s.requireMutation(actorID); err != nil {
		return err
	}
	return s.repo.Delete(id)
}
