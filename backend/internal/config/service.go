package config

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/internal/seocache"
	log "github.com/skaia/backend/internal/syslog"
	"github.com/skaia/backend/models"
)

// Service wraps the repository with business logic.
type Service struct {
	repo          Repository
	invalidateSEO func()
}

type ServiceOption func(*Service)

// WithRedisClient enables tenant-scoped cache invalidation after config writes.
func WithRedisClient(rdb *redis.Client) ServiceOption {
	return func(s *Service) {
		s.invalidateSEO = func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := seocache.InvalidateAll(ctx, rdb); err != nil {
				log.Printf("config: invalidate SEO cache: %v", err)
			}
		}
	}
}

// WithSEOInvalidator supplies an invalidation hook for tests and alternate
// cache backends.
func WithSEOInvalidator(invalidate func()) ServiceOption {
	return func(s *Service) {
		s.invalidateSEO = invalidate
	}
}

// NewService creates a new config Service.
func NewService(repo Repository, options ...ServiceOption) *Service {
	s := &Service{repo: repo}
	for _, option := range options {
		option(s)
	}
	return s
}

// Site config
func (s *Service) GetConfig(key string) (*models.SiteConfig, error) {
	return s.repo.GetConfig(key)
}

func (s *Service) UpsertConfig(key, valueJSON string) error {
	if err := s.repo.UpsertConfig(key, valueJSON); err != nil {
		return err
	}
	if (key == "branding" || key == "seo") && s.invalidateSEO != nil {
		s.invalidateSEO()
	}
	return nil
}

func (s *Service) DeleteConfig(key string) error {
	if err := s.repo.DeleteConfig(key); err != nil {
		return err
	}
	if (key == "branding" || key == "seo") && s.invalidateSEO != nil {
		s.invalidateSEO()
	}
	return nil
}

func (s *Service) DeleteAllSections() error {
	return s.repo.DeleteAllSections()
}

// Landing sections
func (s *Service) ListSections() ([]*models.PageSection, error) {
	return s.repo.ListSections()
}

func (s *Service) GetSection(id int64) (*models.PageSection, error) {
	return s.repo.GetSection(id)
}

func (s *Service) CreateSection(sec *models.PageSection) error {
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

func (s *Service) UpdateSection(sec *models.PageSection) error {
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

// Page items
func (s *Service) ListItems(sectionID int64) ([]*models.PageItem, error) {
	return s.repo.ListItems(sectionID)
}

func (s *Service) GetItem(id int64) (*models.PageItem, error) {
	return s.repo.GetItem(id)
}

func (s *Service) CreateItem(item *models.PageItem) error {
	if item.Config == "" {
		item.Config = "{}"
	}
	return s.repo.CreateItem(item)
}

func (s *Service) UpdateItem(item *models.PageItem) error {
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
