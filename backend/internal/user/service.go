package user

import (
	"errors"
	"log"

	"github.com/skaia/backend/internal/auth"
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

// --- Read operations ---

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

// --- Write operations ---

// Register creates a new user account and returns JWT tokens on success.
func (s *Service) Register(req *models.RegisterRequest) (*models.User, string, string, error) {
	if req.Email == "" || req.Password == "" || req.Username == "" {
		return nil, "", "", errors.New("email, password, and username required")
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Printf("user.Service.Register: hash error: %v", err)
		return nil, "", "", errors.New("registration failed")
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Username
	}

	newUser := &models.User{
		Username:    req.Username,
		Email:       req.Email,
		DisplayName: displayName,
	}

	u, err := s.repo.Create(newUser, hashedPassword)
	if err != nil {
		return nil, "", "", err
	}

	accessToken, err := auth.GenerateTokenWithPermissions(
		u.ID, u.Username, u.Email, u.DisplayName, u.Roles, u.Permissions,
	)
	if err != nil {
		return nil, "", "", errors.New("failed to generate token")
	}

	refreshToken, err := auth.GenerateRefreshToken(u.ID)
	if err != nil {
		return nil, "", "", errors.New("failed to generate token")
	}

	u.PasswordHash = ""
	s.cache.SetByID(u.ID, u)
	return u, accessToken, refreshToken, nil
}

// Login authenticates credentials and returns a user and access token on success.
func (s *Service) Login(email, password string) (*models.User, string, error) {
	if email == "" || password == "" {
		return nil, "", errors.New("email and password required")
	}

	u, err := s.repo.GetByEmail(email)
	if err != nil {
		return nil, "", err
	}

	if !auth.ComparePassword(u.PasswordHash, password) {
		return nil, "", errors.New("invalid credentials")
	}

	if u.IsSuspended {
		reason := ""
		if u.SuspendedReason != nil {
			reason = *u.SuspendedReason
		}
		return nil, "", &SuspendedError{Reason: reason}
	}

	accessToken, err := auth.GenerateTokenWithPermissions(
		u.ID, u.Username, u.Email, u.DisplayName, u.Roles, u.Permissions,
	)
	if err != nil {
		return nil, "", errors.New("failed to generate token")
	}

	u.PasswordHash = ""
	s.cache.SetByID(u.ID, u)
	return u, accessToken, nil
}

// RefreshToken validates a refresh token and issues a new access token
// with up-to-date roles and permissions loaded from the database.
func (s *Service) RefreshToken(refreshToken string) (string, error) {
	claims, err := auth.ValidateToken(refreshToken)
	if err != nil {
		return "", errors.New("invalid refresh token")
	}

	// Always reload from DB to pick up any role/permission changes.
	u, err := s.repo.GetByID(claims.UserID)
	if err != nil {
		return "", errors.New("user not found")
	}
	s.cache.SetByID(u.ID, u)

	return auth.GenerateTokenWithPermissions(
		u.ID, u.Username, u.Email, u.DisplayName, u.Roles, u.Permissions,
	)
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

// --- Domain errors ---

// SuspendedError is returned by Login when the account is suspended.
type SuspendedError struct {
	Reason string
}

func (e *SuspendedError) Error() string {
	return "account suspended: " + e.Reason
}
