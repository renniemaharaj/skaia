package customsection

import "github.com/skaia/backend/models"

// Repository defines data-access operations for custom sections.
type Repository interface {
	GetByID(id int64) (*models.CustomSection, error)
	List() ([]*models.CustomSection, error)
	ListByDataSource(datasourceID int64) ([]*models.CustomSection, error)
	Create(cs *models.CustomSection) error
	Update(cs *models.CustomSection) error
	Delete(id int64) error
}
