package auth

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"errors"
	"fmt"
	"strings"

	"github.com/pquerna/otp/totp"
	"github.com/skaia/backend/models"
	"golang.org/x/crypto/bcrypt"

	ijwt "github.com/skaia/backend/internal/jwt"
)

// SetTOTPSecret sets or updates the TOTP secret for a user (legacy compatibility).
func (s *Service) SetTOTPSecret(userID int64, secret string) error {
	return s.repo.SetTOTPSecret(context.Background(), userID, secret)
}

// Register registers a new user and returns user, access token, and refresh token.
func (s *Service) Register(req *models.RegisterRequest) (*models.User, string, string, error) {
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
	_, err = s.repo.CreateCredential(context.Background(), user.ID, string(hash))
	if err != nil {
		return nil, "", "", err
	}
	// 3. Generate tokens using real JWT logic
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return nil, "", "", err
	}
	refreshToken, err := s.generateRefreshToken(user)
	if err != nil {
		return nil, "", "", err
	}
	return user, accessToken, refreshToken, nil
}

// Login authenticates a user and returns user and access token.
func (s *Service) Login(email, password string) (*models.User, string, error) {
	// Lookup user by email using user service
	user, err := s.userService.GetByEmail(email)
	if err != nil {
		return nil, "", errors.New("user not found")
	}
	cred, err := s.repo.GetCredentialByUserID(context.Background(), user.ID)
	if err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(cred.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return nil, "", err
	}
	return user, accessToken, nil
}

// VerifyTOTP verifies a TOTP code for a user.
func (s *Service) VerifyTOTP(userID int64, code string) (bool, error) {
	totpSecret, err := s.repo.GetTOTPSecretByUserID(context.Background(), userID)
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
func (s *Service) ValidateTOTPBackupCode(userID int64, code string) (bool, error) {
	if code == "" {
		return false, nil
	}
	backupCodes, err := s.repo.GetBackupCodes(context.Background(), userID)
	if err != nil {
		return false, err
	}
	for _, backupCode := range backupCodes {
		if backupCode.Used {
			continue
		}
		if bcrypt.CompareHashAndPassword([]byte(backupCode.CodeHash), []byte(code)) == nil {
			if err := s.repo.UseBackupCode(context.Background(), backupCode.ID); err != nil {
				return false, err
			}
			return true, nil
		}
	}
	return false, nil
}

// GenerateBackupCodes creates a fresh set of one-time backup codes for the user.
// Existing codes are deleted before storing new ones.
func (s *Service) GenerateBackupCodes(userID int64, count int) ([]string, error) {
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
	if err := s.repo.DeleteBackupCodes(context.Background(), userID); err != nil {
		return nil, err
	}
	if err := s.repo.CreateBackupCodes(context.Background(), userID, hashes); err != nil {
		return nil, err
	}
	return codes, nil
}

// DeleteBackupCodes removes all backup codes for the user.
func (s *Service) DeleteBackupCodes(userID int64) error {
	return s.repo.DeleteBackupCodes(context.Background(), userID)
}

// GenerateTOTPSecret creates and stores a new TOTP secret for the user, returns the base32 secret string.
func (s *Service) GenerateTOTPSecret(userID int64) (string, error) {
	// Generate random base32 secret
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	secret := strings.ToUpper(base32.StdEncoding.EncodeToString(buf))
	// Store in DB (disabled by default)
	_, err := s.repo.CreateTOTPSecret(context.Background(), userID, secret)
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
func (s *Service) GetTOTPEnabled(userID int64) (string, bool, error) {
	totpSecret, err := s.repo.GetTOTPSecretByUserID(context.Background(), userID)
	if err != nil {
		return "", false, err
	}
	enabled, err := s.repo.GetTOTPEnabled(context.Background(), userID)
	if err != nil {
		return "", false, err
	}
	return totpSecret.Secret, enabled, nil
}

// EnableTOTP verifies the code, enables TOTP for the user, and returns one-time backup codes.
func (s *Service) EnableTOTP(userID int64, code string) ([]string, error) {
	totpSecret, err := s.repo.GetTOTPSecretByUserID(context.Background(), userID)
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
	codes, err := s.GenerateBackupCodes(userID, 10)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SetTOTPEnabled(context.Background(), userID, true); err != nil {
		_ = s.repo.DeleteBackupCodes(context.Background(), userID)
		return nil, err
	}
	return codes, nil
}

// DisableTOTP disables TOTP for the user and removes any backup codes.
func (s *Service) DisableTOTP(userID int64, password string) error {
	valid, err := s.AuthenticateUser(context.Background(), userID, password)
	if err != nil {
		return err
	}
	if !valid {
		return ErrInvalidPassword
	}
	if err := s.repo.SetTOTPEnabled(context.Background(), userID, false); err != nil {
		return err
	}
	return s.repo.DeleteBackupCodes(context.Background(), userID)
}

// AdminEnableTOTP allows an admin to enable TOTP for a user with a given secret and code.
func (s *Service) AdminEnableTOTP(userID int64, secret, code string) ([]string, error) {
	// Store the secret
	if err := s.repo.SetTOTPSecret(context.Background(), userID, secret); err != nil {
		return nil, err
	}
	// Validate the code
	if !totp.Validate(code, secret) {
		return nil, ErrInvalidTOTPCode
	}
	// Generate backup codes
	codes, err := s.GenerateBackupCodes(userID, 10)
	if err != nil {
		return nil, err
	}
	// Enable TOTP
	if err := s.repo.SetTOTPEnabled(context.Background(), userID, true); err != nil {
		_ = s.repo.DeleteBackupCodes(context.Background(), userID)
		return nil, err
	}
	return codes, nil
}

// AdminDisableTOTP allows an admin to disable TOTP for a user without a password.
func (s *Service) AdminDisableTOTP(userID int64) error {
	if err := s.repo.SetTOTPEnabled(context.Background(), userID, false); err != nil {
		return err
	}
	return s.repo.DeleteBackupCodes(context.Background(), userID)
}

// AdminGenerateBackupCodes allows an admin to regenerate backup codes for a user.
func (s *Service) AdminGenerateBackupCodes(userID int64) ([]string, error) {
	// Delete old codes
	if err := s.repo.DeleteBackupCodes(context.Background(), userID); err != nil {
		return nil, err
	}
	// Generate new codes
	codes, err := s.GenerateBackupCodes(userID, 10)
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

// --- Service methods for handlers ---

// RefreshToken validates the refresh token and issues a new access token.
func (s *Service) RefreshToken(refreshToken string) (string, error) {
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
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return "", err
	}
	return accessToken, nil
}

// --- Token helpers ---
func (s *Service) generateAccessToken(user *models.User) (string, error) {
	return ijwt.GenerateTokenWithPermissions(
		user.ID,
		user.Username,
		user.Email,
		user.DisplayName,
		user.Roles,
		user.Permissions,
	)
}

func (s *Service) generateRefreshToken(user *models.User) (string, error) {
	return ijwt.GenerateRefreshToken(user.ID)
}

func (s *Service) ResetPassword(userID int64) (string, error) {
	// Generate a new random password (for demo, use a static one)
	newPw := generateSecurePassword()
	hash, err := bcrypt.GenerateFromPassword([]byte(newPw), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	err = s.repo.UpdatePasswordHash(context.Background(), userID, string(hash))
	if err != nil {
		return "", err
	}
	return newPw, nil
}

func (s *Service) HasPermission(userID int64, permission string) (bool, error) {
	// TODO: Implement real permission check, possibly via userService
	return true, nil
}

func (s *Service) GetByID(userID int64) (*models.User, error) {
	return s.userService.GetByID(userID)
}

func (s *Service) GetByEmail(email string) (*models.User, error) {
	return s.userService.GetByEmail(email)
}

func (s *Service) CreatePasswordResetToken(userID int64) (string, error) {
	// TODO: Implement real token creation and storage
	return "reset-token", nil
}

func (s *Service) ResetPasswordWithToken(token, newPassword string) error {
	// TODO: Validate token, get user ID, update password
	if token == "" || newPassword == "" {
		return errors.New("invalid token or password")
	}
	// For demo, assume userID=1
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.repo.UpdatePasswordHash(context.Background(), 1, string(hash))
}

func (s *Service) GetPasswordResetTokenUser(token string) (*models.User, error) {
	// TODO: Implement real lookup
	return s.userService.GetByID(1)
}

func (s *Service) CreateEmailVerificationToken(userID int64) (string, error) {
	// TODO: Implement real token creation and storage
	return "verify-token", nil
}

func (s *Service) VerifyEmail(token string) error {
	// TODO: Implement real verification
	if token == "" {
		return errors.New("invalid token")
	}
	return nil
}

func (s *Service) ResendVerificationToken(userID int64) (string, error) {
	// TODO: Implement real resend logic
	return "verify-token", nil
}

func (s *Service) SetMFARequired(userID int64, required bool) error {
	return s.repo.SetMFARequired(context.Background(), userID, required)
}

func (s *Service) GetMFARequired(userID int64) (models.MFAChallengeStatus, error) {
	return s.repo.GetMFARequired(context.Background(), userID)
}
