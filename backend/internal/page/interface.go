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

	// Ownership & editors
	SetOwner(pageID, ownerID int64) error
	ClearOwner(pageID int64) error
	AddEditor(pageID, userID, grantedBy int64) error
	RemoveEditor(pageID, userID int64) error
	GetEditors(pageID int64) ([]*models.PageUser, error)
	GetOwner(pageID int64) (*models.PageUser, error)
	IsEditor(pageID, userID int64) (bool, error)
	ListWithOwnership() ([]*models.Page, error)
}
