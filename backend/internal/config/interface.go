package config

import "github.com/skaia/backend/models"

// Repository defines persistence for site configuration and page section/item data.
type Repository interface {
	// Site config
	GetConfig(key string) (*models.SiteConfig, error)
	UpsertConfig(key, valueJSON string) error
	DeleteConfig(key string) error

	// Page sections
	DeleteAllSections() error
	ListSections() ([]*models.PageSection, error)
	GetSection(id int64) (*models.PageSection, error)
	CreateSection(s *models.PageSection) error
	ShiftSections(fromOrder int) error
	UpdateSection(s *models.PageSection) error
	DeleteSection(id int64) error
	ReorderSections(ids []int64) error

	// Page items
	ListItems(sectionID int64) ([]*models.PageItem, error)
	GetItem(id int64) (*models.PageItem, error)
	CreateItem(item *models.PageItem) error
	UpdateItem(item *models.PageItem) error
	DeleteItem(id int64) error
	ReorderItems(sectionID int64, ids []int64) error
}
