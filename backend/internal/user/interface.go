// Package user encapsulates the user domain: repository interface, SQL implementation,
// in-memory cache, business-logic service, HTTP handlers, and shared helpers.
package user

import "github.com/skaia/backend/models"

// Repository is the storage contract for the user domain.
// Concrete implementations (sqlRepository) live in repository.go.
type Repository interface {
	// Lookups
	GetByID(id int64) (*models.User, error)
	GetByUsername(username string) (*models.User, error)
	GetByEmail(email string) (*models.User, error)

	// Mutations
	Create(user *models.User, passwordHash string) (*models.User, error)
	Update(user *models.User) (*models.User, error)
	Delete(id int64) error

	// Collections
	List(limit, offset int) ([]*models.User, error)
	Search(query string, limit, offset int) ([]*models.User, error)

	// Roles & permissions
	AddRole(userID, roleID int64) error
	RemoveRole(userID, roleID int64) error
	AddRoleByName(userID int64, roleName string) error
	RemoveRoleByName(userID int64, roleName string) error
	GetAllRoles() ([]*models.Role, error)
	HasPermission(userID int64, permission string) (bool, error)
	AddPermission(userID int64, permissionName string) error
	RemovePermission(userID int64, permissionName string) error
	GetAllPermissions() ([]*models.Permission, error)

	// Suspension
	Suspend(userID int64, reason string) error
	Unsuspend(userID int64) error
}
