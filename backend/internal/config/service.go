package config

import "github.com/skaia/backend/models"

// Service wraps the repository with business logic.
type Service struct {
	repo Repository
}

// NewService creates a new config Service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// ── Site config ─────────────────────────────────────────────────────────────

func (s *Service) GetConfig(key string) (*models.SiteConfig, error) {
	return s.repo.GetConfig(key)
}

func (s *Service) UpsertConfig(key, valueJSON string) error {
	return s.repo.UpsertConfig(key, valueJSON)
}

func (s *Service) DeleteConfig(key string) error {
	return s.repo.DeleteConfig(key)
}

func (s *Service) DeleteAllSections() error {
	return s.repo.DeleteAllSections()
}

// ── Landing sections ────────────────────────────────────────────────────────

func (s *Service) ListSections() ([]*models.LandingSection, error) {
	return s.repo.ListSections()
}

func (s *Service) GetSection(id int64) (*models.LandingSection, error) {
	return s.repo.GetSection(id)
}

func (s *Service) CreateSection(sec *models.LandingSection) error {
	if sec.Config == "" {
		sec.Config = "{}"
	}

	// Ensure a sane order (1-based), and gracefully clamp overflow/underflow.
	sections, err := s.repo.ListSections()
	if err != nil {
		return err
	}

	n := len(sections)
	if sec.DisplayOrder < 1 {
		sec.DisplayOrder = 1
	}
	if sec.DisplayOrder > n+1 {
		sec.DisplayOrder = n + 1
	}

	// Shift existing sections down from the insertion point.
	if err := s.repo.ShiftSections(sec.DisplayOrder); err != nil {
		return err
	}

	return s.repo.CreateSection(sec)
}

func (s *Service) UpdateSection(sec *models.LandingSection) error {
	if sec.Config == "" {
		sec.Config = "{}"
	}
	return s.repo.UpdateSection(sec)
}

func (s *Service) DeleteSection(id int64) error {
	return s.repo.DeleteSection(id)
}

func (s *Service) ReorderSections(ids []int64) error {
	return s.repo.ReorderSections(ids)
}

// ── Landing items ───────────────────────────────────────────────────────────

func (s *Service) ListItems(sectionID int64) ([]*models.LandingItem, error) {
	return s.repo.ListItems(sectionID)
}

func (s *Service) GetItem(id int64) (*models.LandingItem, error) {
	return s.repo.GetItem(id)
}

func (s *Service) CreateItem(item *models.LandingItem) error {
	if item.Config == "" {
		item.Config = "{}"
	}
	return s.repo.CreateItem(item)
}

func (s *Service) UpdateItem(item *models.LandingItem) error {
	if item.Config == "" {
		item.Config = "{}"
	}
	return s.repo.UpdateItem(item)
}

func (s *Service) DeleteItem(id int64) error {
	return s.repo.DeleteItem(id)
}

func (s *Service) ReorderItems(sectionID int64, ids []int64) error {
	return s.repo.ReorderItems(sectionID, ids)
}
