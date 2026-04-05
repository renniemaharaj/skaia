package config

import "github.com/skaia/backend/models"

// Repository defines persistence for site configuration and landing page data.
type Repository interface {
	// Site config
	GetConfig(key string) (*models.SiteConfig, error)
	UpsertConfig(key, valueJSON string) error

	// Landing sections
	ListSections() ([]*models.LandingSection, error)
	GetSection(id int64) (*models.LandingSection, error)
	CreateSection(s *models.LandingSection) error
	ShiftSections(fromOrder int) error
	UpdateSection(s *models.LandingSection) error
	DeleteSection(id int64) error
	ReorderSections(ids []int64) error

	// Landing items
	ListItems(sectionID int64) ([]*models.LandingItem, error)
	GetItem(id int64) (*models.LandingItem, error)
	CreateItem(item *models.LandingItem) error
	UpdateItem(item *models.LandingItem) error
	DeleteItem(id int64) error
	ReorderItems(sectionID int64, ids []int64) error
}
