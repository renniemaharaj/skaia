package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"fmt"
	"strings"

	"github.com/pquerna/otp/totp"
	"github.com/skaia/backend/models"
	"golang.org/x/crypto/bcrypt"

	ijwt "github.com/skaia/backend/internal/jwt"
)



// Register registers a new user and returns user, access token, and refresh token.
func (s *Service) Register(ctx context.Context, req *models.RegisterRequest) (*models.User, string, string, error) {
	// 1. Create user (without password) via user service
	user, err := s.userService.CreateUserFromRegisterRequest(req)
	if err != nil {
		return nil, "", "", err
	}
	// 2. Create credential (password hash)
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", "", err
	}
	_, err = s.repo.CreateCredential(ctx, user.ID, string(hash))
	if err != nil {
		return nil, "", "", err
	}
	// 3. Generate tokens using real JWT logic
	accessToken, err := s.generateAccessToken(ctx, user)
	if err != nil {
		return nil, "", "", err
	}
	refreshToken, err := s.generateRefreshToken(ctx, user)
	if err != nil {
		return nil, "", "", err
	}
	return user, accessToken, refreshToken, nil
}

// Login authenticates a user and returns user and access token.
func (s *Service) Login(ctx context.Context, email, password string) (*models.User, string, error) {
	// Lookup user by email using user service
	user, err := s.userService.GetByEmail(email)
	if err != nil {
		return nil, "", errors.New("user not found")
	}
	cred, err := s.repo.GetCredentialByUserID(ctx, user.ID)
	if err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(cred.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	accessToken, err := s.generateAccessToken(ctx, user)
	if err != nil {
		return nil, "", err
	}
	return user, accessToken, nil
}

// VerifyTOTP verifies a TOTP code for a user.
func (s *Service) VerifyTOTP(ctx context.Context, userID int64, code string) (bool, error) {
	totpSecret, err := s.repo.GetTOTPSecretByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	valid := totp.Validate(code, totpSecret.Secret)
	if !valid {
		return false, ErrInvalidTOTPCode
	}
	return true, nil
}

// ValidateTOTPBackupCode validates a user-supplied recovery code, marks it used, and returns whether it was accepted.
func (s *Service) ValidateTOTPBackupCode(ctx context.Context, userID int64, code string) (bool, error) {
	if code == "" {
		return false, nil
	}
	backupCodes, err := s.repo.GetBackupCodes(ctx, userID)
	if err != nil {
		return false, err
	}
	for _, backupCode := range backupCodes {
		if backupCode.Used {
			continue
		}
		if bcrypt.CompareHashAndPassword([]byte(backupCode.CodeHash), []byte(code)) == nil {
			if err := s.repo.UseBackupCode(ctx, backupCode.ID); err != nil {
				return false, err
			}
			return true, nil
		}
	}
	return false, nil
}

// GenerateBackupCodes creates a fresh set of one-time backup codes for the user.
// Existing codes are deleted before storing new ones.
func (s *Service) GenerateBackupCodes(ctx context.Context, userID int64, count int) ([]string, error) {
	if count <= 0 {
		count = 10
	}
	codes := make([]string, 0, count)
	hashes := make([]string, 0, count)
	for i := 0; i < count; i++ {
		code := generateBackupCode()
		hash, err := BcryptPassword(code)
		if err != nil {
			return nil, err
		}
		codes = append(codes, code)
		hashes = append(hashes, hash)
	}
	if err := s.repo.DeleteBackupCodes(ctx, userID); err != nil {
		return nil, err
	}
	if err := s.repo.CreateBackupCodes(ctx, userID, hashes); err != nil {
		return nil, err
	}
	return codes, nil
}

// DeleteBackupCodes removes all backup codes for the user.
func (s *Service) DeleteBackupCodes(ctx context.Context, userID int64) error {
	return s.repo.DeleteBackupCodes(ctx, userID)
}

// GenerateTOTPSecret creates and stores a new TOTP secret for the user, returns the base32 secret string.
func (s *Service) GenerateTOTPSecret(ctx context.Context, userID int64) (string, error) {
	// Generate random base32 secret
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	secret := strings.ToUpper(base32.StdEncoding.EncodeToString(buf))
	// Store in DB (disabled by default)
	_, err := s.repo.CreateTOTPSecret(ctx, userID, secret)
	if err != nil {
		return "", err
	}
	return secret, nil
}

// GetTOTPSecretByUserID gets user's totp model and returns any errors
func (s *Service) GetTOTPSecretByUserID(ctx context.Context, userID int64) (*models.TOTPSecret, error) {
	totp, err := s.repo.GetTOTPSecretByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return totp, err
}

// GetTOTPEnabled returns the TOTP secret and whether it's enabled for the user.
func (s *Service) GetTOTPEnabled(ctx context.Context, userID int64) (string, bool, error) {
	totpSecret, err := s.repo.GetTOTPSecretByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, nil
		}
		return "", false, err
	}
	enabled, err := s.repo.GetTOTPEnabled(ctx, userID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", false, err
	}
	return totpSecret.Secret, enabled, nil
}

// EnableTOTP verifies the code, enables TOTP for the user, and returns one-time backup codes.
func (s *Service) EnableTOTP(ctx context.Context, userID int64, code string) ([]string, error) {
	totpSecret, err := s.repo.GetTOTPSecretByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if totpSecret.Enabled {
		return nil, fmt.Errorf("TOTP is already enabled")
	}
	valid := totp.Validate(code, totpSecret.Secret)
	if !valid {
		return nil, ErrInvalidTOTPCode
	}
	codes, err := s.GenerateBackupCodes(ctx, userID, 10)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SetTOTPEnabled(ctx, userID, true); err != nil {
		_ = s.repo.DeleteBackupCodes(ctx, userID)
		return nil, err
	}
	return codes, nil
}

// DisableTOTP disables TOTP for the user and removes any backup codes.
func (s *Service) DisableTOTP(ctx context.Context, userID int64, password string) error {
	valid, err := s.AuthenticateUser(ctx, userID, password)
	if err != nil {
		return err
	}
	if !valid {
		return ErrInvalidPassword
	}
	if err := s.repo.SetTOTPEnabled(ctx, userID, false); err != nil {
		return err
	}
	return s.repo.DeleteBackupCodes(ctx, userID)
}

// AdminEnableTOTP allows an admin to enable TOTP for a user with a given secret and code.
func (s *Service) AdminEnableTOTP(ctx context.Context, userID int64, secret, code string) ([]string, error) {
	// Store the secret
	if _, err := s.repo.CreateTOTPSecret(ctx, userID, secret); err != nil {
		return nil, err
	}
	// Validate the code
	if !totp.Validate(code, secret) {
		return nil, ErrInvalidTOTPCode
	}
	// Generate backup codes
	codes, err := s.GenerateBackupCodes(ctx, userID, 10)
	if err != nil {
		return nil, err
	}
	// Enable TOTP
	if err := s.repo.SetTOTPEnabled(ctx, userID, true); err != nil {
		_ = s.repo.DeleteBackupCodes(ctx, userID)
		return nil, err
	}
	return codes, nil
}

// AdminDisableTOTP allows an admin to disable TOTP for a user without a password.
func (s *Service) AdminDisableTOTP(ctx context.Context, userID int64) error {
	if err := s.repo.SetTOTPEnabled(ctx, userID, false); err != nil {
		return err
	}
	return s.repo.DeleteBackupCodes(ctx, userID)
}

// AdminGenerateBackupCodes allows an admin to regenerate backup codes for a user.
func (s *Service) AdminGenerateBackupCodes(ctx context.Context, userID int64) ([]string, error) {
	// Delete old codes
	if err := s.repo.DeleteBackupCodes(ctx, userID); err != nil {
		return nil, err
	}
	// Generate new codes
	codes, err := s.GenerateBackupCodes(ctx, userID, 10)
	if err != nil {
		return nil, err
	}
	return codes, nil
}

var ErrInvalidPassword = errors.New("invalid password")
var ErrInvalidTOTPCode = errors.New("invalid TOTP code")

type UserService interface {
	GetByID(id int64) (*models.User, error)
	GetByEmail(email string) (*models.User, error)
	CreateUserFromRegisterRequest(req *models.RegisterRequest) (*models.User, error)
	HasPermission(userID int64, permission string) (bool, error)
}

type Service struct {
	repo        Repository
	userService UserService
}

func NewService(r Repository, userService UserService) *Service {
	return &Service{repo: r, userService: userService}
}

// RegisterCredential creates a new credential for a user.
func (s *Service) RegisterCredential(ctx context.Context, userID int64, password string) (*models.Credential, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	return s.repo.CreateCredential(ctx, userID, string(hash))
}

// AuthenticateUser checks a user's password.
func (s *Service) AuthenticateUser(ctx context.Context, userID int64, password string) (bool, error) {
	cred, err := s.repo.GetCredentialByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(cred.PasswordHash), []byte(password)); err != nil {
		return false, nil
	}
	return true, nil
}

// ChangePassword changes a user's password if the old one matches.
func (s *Service) ChangePassword(ctx context.Context, userID int64, oldPassword, newPassword string) error {
	valid, err := s.AuthenticateUser(ctx, userID, oldPassword)
	if err != nil {
		return err
	}
	if !valid {
		return ErrInvalidPassword
	}
	if err := ValidatePassword(newPassword); err != nil {
		return err
	}
	hash, err := BcryptPassword(newPassword)
	if err != nil {
		return err
	}
	return s.repo.UpdatePasswordHash(ctx, userID, hash)
}

// --- Service methods for handlers ---

// RefreshToken validates the refresh token and issues a new access token.
func (s *Service) RefreshToken(ctx context.Context, refreshToken string) (string, error) {
	if refreshToken == "" {
		return "", errors.New("invalid refresh token")
	}
	// Validate the refresh token
	claims, err := ijwt.ValidateToken(refreshToken)
	if err != nil {
		return "", errors.New("invalid refresh token")
	}
	// Get user by ID
	user, err := s.userService.GetByID(claims.UserID)
	if err != nil {
		return "", errors.New("user not found")
	}
	// Issue new access token
	accessToken, err := s.generateAccessToken(ctx, user)
	if err != nil {
		return "", err
	}
	return accessToken, nil
}

// --- Token helpers ---
func (s *Service) generateAccessToken(ctx context.Context, user *models.User) (string, error) {
	return ijwt.GenerateTokenWithPermissions(
		user.ID,
		user.Username,
		user.Email,
		user.DisplayName,
		user.Roles,
		user.Permissions,
	)
}

func (s *Service) generateRefreshToken(ctx context.Context, user *models.User) (string, error) {
	return ijwt.GenerateRefreshToken(user.ID)
}

func (s *Service) ResetPassword(ctx context.Context, userID int64) (string, error) {
	// Generate a new random password (for demo, use a static one)
	newPw := generateSecurePassword()
	hash, err := bcrypt.GenerateFromPassword([]byte(newPw), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	err = s.repo.UpdatePasswordHash(ctx, userID, string(hash))
	if err != nil {
		return "", err
	}
	return newPw, nil
}

func (s *Service) HasPermission(ctx context.Context, userID int64, permission string) (bool, error) {
	return s.userService.HasPermission(userID, permission)
}

func (s *Service) GetByID(ctx context.Context, userID int64) (*models.User, error) {
	return s.userService.GetByID(userID)
}

func (s *Service) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	return s.userService.GetByEmail(email)
}

func (s *Service) CreatePasswordResetToken(ctx context.Context, userID int64) (string, error) {
	return "", errors.New("not implemented")
}

func (s *Service) ResetPasswordWithToken(ctx context.Context, token, newPassword string) error {
	return errors.New("not implemented")
}

func (s *Service) GetPasswordResetTokenUser(ctx context.Context, token string) (*models.User, error) {
	return nil, errors.New("not implemented")
}

func (s *Service) CreateEmailVerificationToken(ctx context.Context, userID int64) (string, error) {
	return "", errors.New("not implemented")
}

func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	return errors.New("not implemented")
}

func (s *Service) ResendVerificationToken(ctx context.Context, userID int64) (string, error) {
	return "", errors.New("not implemented")
}

func (s *Service) SetMFARequired(ctx context.Context, userID int64, required bool) error {
	return s.repo.SetMFARequired(ctx, userID, required)
}

func (s *Service) GetMFARequired(ctx context.Context, userID int64) (models.MFAChallengeStatus, error) {
	return s.repo.GetMFARequired(ctx, userID)
}
