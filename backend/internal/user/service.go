package user

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/models"
)

// AdminEnableTOTP allows an admin to enable TOTP for another user, optionally setting a secret and verifying a code.
func (s *Service) AdminEnableTOTP(targetID int64, secret, code string) ([]string, error) {
	user, err := s.repo.GetByID(targetID)
	if err != nil {
		return nil, errors.New("user not found")
	}
	if user.TOTPEnabled {
		return nil, errors.New("2FA is already enabled")
	}
	if secret != "" {
		if err := s.repo.SetTOTPSecret(targetID, secret); err != nil {
			return nil, errors.New("failed to set TOTP secret")
		}
	}
	// If a code is provided, validate it (if secret is set or already present)
	if code != "" {
		u, err := s.repo.GetByID(targetID)
		if err != nil {
			return nil, errors.New("user not found")
		}
		if u.TOTPSecret == "" {
			return nil, errors.New("TOTP secret not set for user")
		}
		if !validateTOTPCode(u.TOTPSecret, code) {
			return nil, errors.New("invalid verification code")
		}
	}
	backupCodes, err := s.EnableTOTP(targetID)
	if err != nil {
		return nil, err
	}
	// Optionally: log/admin audit here
	s.cache.Invalidate(targetID)
	return backupCodes, nil
}

// AdminDisableTOTP allows an admin to disable TOTP for another user.
func (s *Service) AdminDisableTOTP(targetID int64) error {
	user, err := s.repo.GetByID(targetID)
	if err != nil {
		return errors.New("user not found")
	}
	if !user.TOTPEnabled {
		return errors.New("2FA is not enabled")
	}
	if err := s.DisableTOTP(targetID); err != nil {
		return err
	}
	// Optionally: log/admin audit here
	s.cache.Invalidate(targetID)
	return nil

}

const securePassChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"

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

func generateSecurePassword(length int) string {
	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(securePassChars))))
		b[i] = securePassChars[n.Int64()]
	}
	return string(b)
}

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

// Register creates a new user account and returns JWT tokens on success.
func (s *Service) Register(req *models.RegisterRequest) (*models.User, string, string, error) {
	if req.Email == "" || req.Password == "" || req.Username == "" {
		return nil, "", "", errors.New("email, password, and username required")
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Printf("user.Service.Register: hash error: %v", err)
		return nil, "", "", errors.New(err.Error())
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

// GetRoleByID returns the role with the given id.
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

// ResetPassword generates a new secure random password for the target user,
// hashes and stores it, then returns the plaintext password so the caller can
// deliver it (e.g. via a noreply inbox message).
func (s *Service) ResetPassword(targetID int64) (string, error) {
	newPw := generateSecurePassword(16)
	hash, err := auth.HashPassword(newPw)
	if err != nil {
		return "", err
	}
	if err := s.repo.UpdatePasswordHash(targetID, hash); err != nil {
		return "", err
	}
	s.cache.Invalidate(targetID)
	return newPw, nil
}

// SuspendedError is returned by Login when the account is suspended.
type SuspendedError struct {
	Reason string
}

func (e *SuspendedError) Error() string {
	return "account suspended: " + e.Reason
}

// ── Email verification ────────────────────────────────────────────────────

// CreateEmailVerificationToken generates a secure token and stores it.
func (s *Service) CreateEmailVerificationToken(userID int64) (string, error) {
	token := generateSecureToken(64)
	expiresAt := time.Now().Add(24 * time.Hour)
	if err := s.repo.CreateEmailVerificationToken(userID, token, expiresAt); err != nil {
		return "", err
	}
	return token, nil
}

// VerifyEmail validates the token and marks the user's email as verified.
func (s *Service) VerifyEmail(token string) error {
	t, err := s.repo.GetEmailVerificationToken(token)
	if err != nil {
		return errors.New("invalid or expired verification token")
	}
	if time.Now().After(t.ExpiresAt) {
		return errors.New("verification token has expired")
	}
	if err := s.repo.MarkEmailVerified(t.UserID); err != nil {
		return err
	}
	s.cache.Invalidate(t.UserID)
	_ = s.repo.DeleteEmailVerificationTokens(t.UserID)
	return nil
}

// ResendVerificationToken deletes old tokens and creates a new one.
func (s *Service) ResendVerificationToken(userID int64) (string, error) {
	_ = s.repo.DeleteEmailVerificationTokens(userID)
	return s.CreateEmailVerificationToken(userID)
}

// ── Password reset ────────────────────────────────────────────────────────

// CreatePasswordResetToken generates a secure token for password recovery.
func (s *Service) CreatePasswordResetToken(userID int64) (string, error) {
	_ = s.repo.DeletePasswordResetTokens(userID) // revoke old tokens
	token := generateSecureToken(64)
	expiresAt := time.Now().Add(1 * time.Hour)
	if err := s.repo.CreatePasswordResetToken(userID, token, expiresAt); err != nil {
		return "", err
	}
	return token, nil
}

// ResetPasswordWithToken validates the reset token and sets a new password.
func (s *Service) ResetPasswordWithToken(token, newPassword string) error {
	if len(newPassword) < 8 || len(newPassword) > 72 {
		return errors.New("password must be 8-72 characters")
	}
	t, err := s.repo.GetPasswordResetToken(token)
	if err != nil {
		return errors.New("invalid or expired reset token")
	}
	if t.Used {
		return errors.New("reset token has already been used")
	}
	if time.Now().After(t.ExpiresAt) {
		return errors.New("reset token has expired")
	}
	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.repo.UpdatePasswordHash(t.UserID, hash); err != nil {
		return err
	}
	_ = s.repo.MarkPasswordResetTokenUsed(t.ID)
	s.cache.Invalidate(t.UserID)
	return nil
}

// GetPasswordResetTokenUser returns the user associated with a reset token (for email notifications).
func (s *Service) GetPasswordResetTokenUser(token string) (*models.User, error) {
	t, err := s.repo.GetPasswordResetToken(token)
	if err != nil {
		return nil, err
	}
	return s.GetByID(t.UserID)
}

// ── TOTP / 2FA ────────────────────────────────────────────────────────────

// SetTOTPSecret stores a TOTP secret for the user (without enabling it yet).
func (s *Service) SetTOTPSecret(userID int64, secret string) error {
	if err := s.repo.SetTOTPSecret(userID, secret); err != nil {
		return err
	}
	s.cache.Invalidate(userID)
	return nil
}

// EnableTOTP enables 2FA for the user and generates backup codes.
func (s *Service) EnableTOTP(userID int64) ([]string, error) {
	if err := s.repo.EnableTOTP(userID); err != nil {
		return nil, err
	}
	_ = s.repo.DeleteTOTPBackupCodes(userID)

	plainCodes := make([]string, 10)
	hashes := make([]string, 10)
	for i := range plainCodes {
		plainCodes[i] = generateBackupCode()
		h := sha256.Sum256([]byte(plainCodes[i]))
		hashes[i] = hex.EncodeToString(h[:])
	}
	if err := s.repo.CreateTOTPBackupCodes(userID, hashes); err != nil {
		return nil, err
	}
	s.cache.Invalidate(userID)
	return plainCodes, nil
}

// DisableTOTP disables 2FA and removes backup codes.
func (s *Service) DisableTOTP(userID int64) error {
	if err := s.repo.DisableTOTP(userID); err != nil {
		return err
	}
	_ = s.repo.DeleteTOTPBackupCodes(userID)
	s.cache.Invalidate(userID)
	return nil
}

// ValidateTOTPBackupCode checks if a backup code matches and consumes it.
func (s *Service) ValidateTOTPBackupCode(userID int64, code string) (bool, error) {
	codes, err := s.repo.GetTOTPBackupCodes(userID)
	if err != nil {
		return false, err
	}
	h := sha256.Sum256([]byte(code))
	hex := hex.EncodeToString(h[:])
	for _, c := range codes {
		if !c.Used && c.CodeHash == hex {
			if err := s.repo.UseTOTPBackupCode(c.ID); err != nil {
				return false, err
			}
			return true, nil
		}
	}
	return false, nil
}

// ── Token helpers ─────────────────────────────────────────────────────────

const tokenChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func generateSecureToken(length int) string {
	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(tokenChars))))
		b[i] = tokenChars[n.Int64()]
	}
	return string(b)
}

func generateBackupCode() string {
	const digits = "0123456789"
	b := make([]byte, 8)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		b[i] = digits[n.Int64()]
	}
	return string(b[:4]) + "-" + string(b[4:])
}
