package user

import (
	"fmt"
	"net/http"

	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Service contains all business logic for the user domain.
// It sits between handlers and the repository, providing caching and
// orchestrating multi-step operations such as registration and login.
type Service struct {
	repo  Repository
	cache *Cache
}

// NewService wires together a repository and an in-memory cache.
func NewService(repo Repository, cache *Cache) *Service {
	return &Service{repo: repo, cache: cache}
}

// GetByID returns the user with the given id.
// The result is served from the cache when available; otherwise it is loaded
// from the database and stored in the cache for subsequent calls.
func (s *Service) GetByID(id int64) (*models.User, error) {
	if u, ok := s.cache.GetByID(id); ok {
		return u, nil
	}
	u, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	s.cache.SetByID(id, u)
	return u, nil
}

// GetByEmail loads a user by email address directly from the database.
// The result is propagated into the cache.
func (s *Service) GetByEmail(email string) (*models.User, error) {
	u, err := s.repo.GetByEmail(email)
	if err != nil {
		return nil, err
	}
	s.cache.SetByID(u.ID, u)
	return u, nil
}

// GetByUsername loads a user by username directly from the database.
func (s *Service) GetByUsername(username string) (*models.User, error) {
	u, err := s.repo.GetByUsername(username)
	if err != nil {
		return nil, err
	}
	s.cache.SetByID(u.ID, u)
	return u, nil
}

// List returns a paginated slice of users.
func (s *Service) List(limit, offset int) ([]*models.User, error) {
	return s.repo.List(limit, offset)
}

// Search returns users whose username, email, or display name match query.
func (s *Service) Search(query string, limit, offset int) ([]*models.User, error) {
	return s.repo.Search(query, limit, offset)
}

// GetAllPermissions returns every permission definition in the system.
func (s *Service) GetAllPermissions() ([]*models.Permission, error) {
	return s.repo.GetAllPermissions()
}

// Update persists changes to a user record and invalidates the cache entry.
func (s *Service) Update(u *models.User) (*models.User, error) {
	updated, err := s.repo.Update(u)
	if err != nil {
		return nil, err
	}
	s.cache.SetByID(updated.ID, updated)
	return updated, nil
}

// InvalidateUser evicts a user from the cache, forcing a fresh database read on next access.
func (s *Service) InvalidateUser(userID int64) {
	s.cache.Invalidate(userID)
}

// Delete removes a user and evicts them from the cache.
func (s *Service) Delete(id int64) error {
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	s.cache.Invalidate(id)
	return nil
}

// HasPermission reports whether userID holds the named permission (or is an
// admin). This is the DB-authoritative check used by all domain handlers.
func (s *Service) HasPermission(userID int64, permission string) (bool, error) {
	return s.repo.HasPermission(userID, permission)
}

// AddPermission grants a named permission to the user and evicts the cache entry.
func (s *Service) AddPermission(userID int64, permissionName string) error {
	if err := s.repo.AddPermission(userID, permissionName); err != nil {
		return err
	}
	s.cache.Invalidate(userID)
	return nil
}

// RemovePermission revokes a named permission and evicts the cache entry.
func (s *Service) RemovePermission(userID int64, permissionName string) error {
	if err := s.repo.RemovePermission(userID, permissionName); err != nil {
		return err
	}
	s.cache.Invalidate(userID)
	return nil
}

func (s *Service) RemoveAllPermissions(userID int64) error {
	user, err := s.repo.GetByID(userID)
	if err != nil {
		return err
	}
	for _, perm := range user.Permissions {
		if err := s.repo.RemovePermission(userID, perm); err != nil {
			return err
		}
	}
	s.cache.Invalidate(userID)
	return nil
}

// AddRoleByName assigns a role (by name) to a user.
func (s *Service) AddRoleByName(userID int64, roleName string) error {
	if err := s.repo.AddRoleByName(userID, roleName); err != nil {
		return err
	}
	s.cache.Invalidate(userID)
	return nil
}

// RemoveRoleByName revokes a role (by name) from a user.
func (s *Service) RemoveRoleByName(userID int64, roleName string) error {
	if err := s.repo.RemoveRoleByName(userID, roleName); err != nil {
		return err
	}
	s.cache.Invalidate(userID)
	return nil
}

// GetAllRoles returns every role definition in the system.
func (s *Service) GetAllRoles() ([]*models.Role, error) {
	return s.repo.GetAllRoles()
}

// GetUserMaxPowerLevel returns the highest power_level among all roles assigned to userID.
func (s *Service) GetUserMaxPowerLevel(userID int64) (int, error) {
	return s.repo.GetUserMaxPowerLevel(userID)
}

// NewDistinctSuperuserDemotionVote records a vote from actorID to demote targetID from superuser status, ensuring uniqueness of the vote.
func (s *Service) NewDistinctSuperuserDemotionVote(actorID, targetID int64) error {
	err := s.repo.NewDistinctSuperuserDemotionVote(actorID, targetID)
	if err != nil {
		return err
	}

	toDemote, err := s.repo.IsSuperUserVotedOut(targetID)
	if err != nil {
		return err
	}

	if toDemote {
		// If the target has reached the vote threshold for demotion,
		// remove all of their roles and permissions, effectively stripping superuser status.
		if err := s.RemoveAllRoles(targetID); err != nil {
			return err
		}
		if err := s.RemoveAllPermissions(targetID); err != nil {
			return err
		}
		// Optionally: log/admin audit here about the demotion event
		s.cache.Invalidate(targetID)
	}
	return nil
}

func (s *Service) GetRoleByID(id int64) (*models.Role, error) {
	return s.repo.GetRoleByID(id)
}

// CreateRole creates a new role.
func (s *Service) CreateRole(name, description string, powerLevel int) (*models.Role, error) {
	return s.repo.CreateRole(name, description, powerLevel)
}

// UpdateRole updates an existing role's attributes.
func (s *Service) UpdateRole(id int64, name, description string, powerLevel int) (*models.Role, error) {
	return s.repo.UpdateRole(id, name, description, powerLevel)
}

// DeleteRole deletes a role by ID.
func (s *Service) DeleteRole(id int64) error {
	return s.repo.DeleteRole(id)
}

// GetRolePermissions returns all permissions assigned to the given role.
func (s *Service) GetRolePermissions(roleID int64) ([]*models.Permission, error) {
	return s.repo.GetRolePermissions(roleID)
}

// AddPermissionToRole assigns a permission to a role.
func (s *Service) AddPermissionToRole(roleID int64, permissionName string) error {
	return s.repo.AddPermissionToRole(roleID, permissionName)
}

// RemovePermissionFromRole removes a permission from a role.
func (s *Service) RemovePermissionFromRole(roleID int64, permissionName string) error {
	return s.repo.RemovePermissionFromRole(roleID, permissionName)
}

// Suspend suspends a user account with an optional reason.
func (s *Service) Suspend(userID int64, reason string) error {
	if err := s.repo.Suspend(userID, reason); err != nil {
		return err
	}
	s.cache.Invalidate(userID)
	return nil
}

// Unsuspend reinstates a suspended user account.
func (s *Service) Unsuspend(userID int64) error {
	if err := s.repo.Unsuspend(userID); err != nil {
		return err
	}
	s.cache.Invalidate(userID)
	return nil
}

// CheckManagePowerLevel enforces that actorID's max power level is strictly
func (s *Service) CheckManagePowerLevel(w http.ResponseWriter, actorID, targetID int64) bool {
	actorLevel, err := s.repo.GetUserMaxPowerLevel(actorID)
	if err != nil {
		fmt.Printf("Error fetching actor's max power level: %v\n", err)
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return false
	}

	targetLevel, err := s.repo.GetUserMaxPowerLevel(targetID)
	if err != nil {
		fmt.Printf("Error fetching target's max power level: %v\n", err)
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return false
	}

	if actorLevel <= targetLevel {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions to manage this user")
		return false
	}
	return true
}

// CreateUserFromRegisterRequest creates a user from a RegisterRequest (without password).
func (s *Service) CreateUserFromRegisterRequest(req *models.RegisterRequest) (*models.User, error) {
	user := &models.User{
		Username:    req.Username,
		Email:       req.Email,
		DisplayName: req.DisplayName,
		// Other fields can be set as needed, e.g. AvatarURL, etc.
	}
	// Password is not handled here; auth will create credential after user is created.
	return s.repo.Create(user, "")
}

// RemoveAllRoles removes all roles from a user.
func (s *Service) RemoveAllRoles(userID int64) error {
	user, err := s.repo.GetByID(userID)
	if err != nil {
		return err
	}
	for _, role := range user.Roles {
		if err := s.repo.RemoveRoleByName(userID, role); err != nil {
			return err
		}
	}
	s.cache.Invalidate(userID)
	return nil
}

// GetRoleByIDName returns a role by its name (for handler logic).
func (s *Service) GetRoleByIDName(name string) (*models.Role, error) {
	roles, err := s.repo.GetAllRoles()
	if err != nil {
		return nil, err
	}
	for _, r := range roles {
		if r.Name == name {
			return r, nil
		}
	}
	return nil, fmt.Errorf("role not found")
}
