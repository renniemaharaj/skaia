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

	// Power level
	GetUserMaxPowerLevel(userID int64) (int, error)
	NewDistinctSuperuserDemotionVote(actorID, targetID int64) error
	IsSuperUserVotedOut(targetID int64) (bool, error)

	// Role CRUD
	CreateRole(name, description string, powerLevel int) (*models.Role, error)
	UpdateRole(id int64, name, description string, powerLevel int) (*models.Role, error)
	DeleteRole(id int64) error
	GetRoleByID(id int64) (*models.Role, error)
	GetRolePermissions(roleID int64) ([]*models.Permission, error)
	AddPermissionToRole(roleID int64, permissionName string) error
	RemovePermissionFromRole(roleID int64, permissionName string) error

	// Suspension
	Suspend(userID int64, reason string) error
	Unsuspend(userID int64) error

	// Password
	UpdatePasswordHash(userID int64, newHash string) error

	// Email verification
	CreateEmailVerificationToken(userID int64, token string, expiresAt interface{}) error
	GetEmailVerificationToken(token string) (*models.EmailVerificationToken, error)
	MarkEmailVerified(userID int64) error
	DeleteEmailVerificationTokens(userID int64) error

	// Password reset
	CreatePasswordResetToken(userID int64, token string, expiresAt interface{}) error
	GetPasswordResetToken(token string) (*models.PasswordResetToken, error)
	MarkPasswordResetTokenUsed(tokenID int64) error
	DeletePasswordResetTokens(userID int64) error

	// TOTP / 2FA
	SetTOTPSecret(userID int64, secret string) error
	EnableTOTP(userID int64) error
	DisableTOTP(userID int64) error
	CreateTOTPBackupCodes(userID int64, codeHashes []string) error
	GetTOTPBackupCodes(userID int64) ([]*models.TOTPBackupCode, error)
	UseTOTPBackupCode(codeID int64) error
	DeleteTOTPBackupCodes(userID int64) error
}
