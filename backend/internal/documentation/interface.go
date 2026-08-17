package docs

import "github.com/skaia/backend/models"

type NavigationItem struct {
	ID           int64 `json:"id"`
	DisplayOrder int   `json:"display_order"`
}

type NavigationOrder struct {
	Sections []NavigationItem `json:"sections"`
	Articles []NavigationItem `json:"articles"`
}

type Repository interface {
	ListPublic() ([]models.Documentation, error)
	ListAll() ([]models.Documentation, error)
	ListOwned(ownerID int64) ([]models.Documentation, error)
	GetByID(id int64) (*models.Documentation, error)
	GetBySlug(slug string) (*models.Documentation, error)
	Create(doc *models.Documentation) error
	Update(doc *models.Documentation, expectedRevision int64) error
	Delete(id, actorID int64) error
	Manifest(documentationID int64) (*models.DocumentationManifest, error)
	GetSection(id int64) (*models.DocumentationSection, error)
	CreateSection(section *models.DocumentationSection) error
	UpdateSection(section *models.DocumentationSection) error
	DeleteSection(id, actorID int64) error
	GetArticleByID(id int64) (*models.DocumentationArticle, error)
	GetArticleBySlug(documentationID int64, slug string) (*models.DocumentationArticle, error)
	CreateArticle(article *models.DocumentationArticle) error
	UpdateArticle(article *models.DocumentationArticle, expectedRevision int64) error
	DeleteArticle(id, actorID int64) error
	Reorder(documentationID int64, order NavigationOrder) error
	Search(documentationID int64, query string, limit int) ([]models.DocumentationSearchResult, error)
}

type Authorizer interface {
	HasPermission(userID int64, permission string) (bool, error)
}
