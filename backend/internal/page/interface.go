package page

import "github.com/skaia/backend/models"

// Repository defines data-access operations for custom pages.
type Repository interface {
	GetBySlug(slug string) (*models.Page, error)
	GetIndex() (*models.Page, error)
	GetByID(id int64) (*models.Page, error)
	Create(p *models.Page) error
	Update(p *models.Page) error
	Delete(id int64) error
	List() ([]*models.Page, error)
}
