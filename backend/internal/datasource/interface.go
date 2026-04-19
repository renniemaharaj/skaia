package datasource

import "github.com/skaia/backend/models"

// Repository defines data-access operations for data sources.
type Repository interface {
	GetByID(id int64) (*models.DataSource, error)
	List() ([]*models.DataSource, error)
	Create(ds *models.DataSource) error
	Update(ds *models.DataSource) error
	Delete(id int64) error
	GetEnvData(id int64) (string, error)
	UpdateEnvData(id int64, envData string) error
}
