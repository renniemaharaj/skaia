package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

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

// Impersonate issues tokens for targetUserID after the HTTP layer has
// completed authorization checks for the acting administrator.
func (s *Service) Impersonate(ctx context.Context, targetUserID int64) (*models.User, string, string, error) {
	user, err := s.userService.GetByID(targetUserID)
	if err != nil {
		return nil, "", "", errors.New("user not found")
	}
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
var ErrRecoveryRequestRateLimited = errors.New("please wait before requesting account recovery again")
var ErrRecoveryRequestNotFound = errors.New("recovery request not found")
var ErrRecoveryRequestExpired = errors.New("recovery request expired")
var ErrRecoveryRequestAlreadyPending = errors.New("you already have a recovery request pending")
var ErrRecoveryChallengeRequired = errors.New("MFA Required")
var ErrRecoveryChallengeMethodRequired = errors.New("TOTP must be enabled to resolve recovery requests")

const recoveryRequestTTL = 30 * time.Minute
const recoveryRequestCooldown = 2 * time.Minute
const recoveryChallengeTTL = 10 * time.Minute

type recoveryChallengeJob struct {
	Key      string
	ExpireAt time.Time
}

type UserService interface {
	GetByID(id int64) (*models.User, error)
	GetByEmail(email string) (*models.User, error)
	CreateUserFromRegisterRequest(req *models.RegisterRequest) (*models.User, error)
	HasPermission(userID int64, permission string) (bool, error)
}

type Service struct {
	repo               Repository
	userService        UserService
	recoveryMu         sync.Mutex
	recoveryRequests   map[string]*models.RecoveryRequest
	recoveryLastSeen   map[string]time.Time
	recoveryChallenges map[int64]recoveryChallengeJob
}

func NewService(r Repository, userService UserService) *Service {
	return &Service{
		repo:               r,
		userService:        userService,
		recoveryRequests:   make(map[string]*models.RecoveryRequest),
		recoveryLastSeen:   make(map[string]time.Time),
		recoveryChallenges: make(map[int64]recoveryChallengeJob),
	}
}

func recoveryRateKey(kind, value string) string {
	return kind + ":" + strings.ToLower(strings.TrimSpace(value))
}

func (s *Service) cleanupRecoveryRequestsLocked(now time.Time) {
	for id, req := range s.recoveryRequests {
		if !now.Before(req.ExpiresAt) || req.Status != "pending" {
			delete(s.recoveryRequests, id)
		}
	}
	for key, seen := range s.recoveryLastSeen {
		if now.Sub(seen) > recoveryRequestTTL {
			delete(s.recoveryLastSeen, key)
		}
	}
	for userID, challenge := range s.recoveryChallenges {
		if !now.Before(challenge.ExpireAt) {
			delete(s.recoveryChallenges, userID)
		}
	}
}

func newRecoveryRequestID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

// CreateRecoveryRequest records a short-lived recovery request for an existing
// account. Missing accounts are silently ignored by callers to avoid public
// account enumeration while still applying rate limits.
func (s *Service) CreateRecoveryRequest(ctx context.Context, email, ip, guestSessionID string) (*models.RecoveryRequest, bool, error) {
	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" {
		return nil, false, errors.New("email required")
	}

	now := time.Now()
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.cleanupRecoveryRequestsLocked(now)

	user, err := s.userService.GetByEmail(normalizedEmail)
	if err != nil {
		for _, key := range []string{
			recoveryRateKey("email", normalizedEmail),
			recoveryRateKey("ip", ip),
		} {
			if seen, ok := s.recoveryLastSeen[key]; ok && now.Sub(seen) < recoveryRequestCooldown {
				return nil, false, ErrRecoveryRequestRateLimited
			}
			s.recoveryLastSeen[key] = now
		}
		return nil, false, nil
	}

	for _, req := range s.recoveryRequests {
		if req.UserID == user.ID && req.Status == "pending" {
			copyReq := *req
			return &copyReq, true, ErrRecoveryRequestAlreadyPending
		}
	}

	for _, key := range []string{
		recoveryRateKey("email", normalizedEmail),
		recoveryRateKey("ip", ip),
	} {
		if seen, ok := s.recoveryLastSeen[key]; ok && now.Sub(seen) < recoveryRequestCooldown {
			return nil, false, ErrRecoveryRequestRateLimited
		}
		s.recoveryLastSeen[key] = now
	}

	id := newRecoveryRequestID()
	req := &models.RecoveryRequest{
		ID:             id,
		Email:          normalizedEmail,
		UserID:         user.ID,
		Username:       user.Username,
		DisplayName:    user.DisplayName,
		Status:         "pending",
		GuestSessionID: strings.TrimSpace(guestSessionID),
		CreatedAt:      now,
		ExpiresAt:      now.Add(recoveryRequestTTL),
	}
	s.recoveryRequests[id] = req
	copyReq := *req
	return &copyReq, false, nil
}

func (s *Service) ListRecoveryRequests(ctx context.Context) []*models.RecoveryRequest {
	now := time.Now()
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.cleanupRecoveryRequestsLocked(now)

	requests := make([]*models.RecoveryRequest, 0, len(s.recoveryRequests))
	for _, req := range s.recoveryRequests {
		copyReq := *req
		requests = append(requests, &copyReq)
	}
	sort.Slice(requests, func(i, j int) bool {
		return requests[i].CreatedAt.After(requests[j].CreatedAt)
	})
	return requests
}

func (s *Service) GetRecoveryRequest(ctx context.Context, requestID string) (*models.RecoveryRequest, error) {
	now := time.Now()
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.cleanupRecoveryRequestsLocked(now)

	req, ok := s.recoveryRequests[requestID]
	if !ok {
		return nil, ErrRecoveryRequestNotFound
	}
	if !now.Before(req.ExpiresAt) {
		delete(s.recoveryRequests, requestID)
		return nil, ErrRecoveryRequestExpired
	}
	copyReq := *req
	return &copyReq, nil
}

func (s *Service) ResolveRecoveryRequest(ctx context.Context, requestID, status string) (*models.RecoveryRequest, error) {
	now := time.Now()
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	s.cleanupRecoveryRequestsLocked(now)

	req, ok := s.recoveryRequests[requestID]
	if !ok {
		return nil, ErrRecoveryRequestNotFound
	}
	if !now.Before(req.ExpiresAt) {
		delete(s.recoveryRequests, requestID)
		return nil, ErrRecoveryRequestExpired
	}
	req.Status = status
	copyReq := *req
	delete(s.recoveryRequests, requestID)
	return &copyReq, nil
}

func (s *Service) ExpireRecoveryRequestsByGuestSession(ctx context.Context, guestSessionID string) []*models.RecoveryRequest {
	guestSessionID = strings.TrimSpace(guestSessionID)
	if guestSessionID == "" {
		return nil
	}

	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()

	expired := make([]*models.RecoveryRequest, 0)
	for id, req := range s.recoveryRequests {
		if req.GuestSessionID != guestSessionID || req.Status != "pending" {
			continue
		}
		req.Status = "expired"
		copyReq := *req
		expired = append(expired, &copyReq)
		delete(s.recoveryRequests, id)
	}
	return expired
}

func recoveryChallengeKey(requestID, action string) string {
	return strings.TrimSpace(action) + ":" + strings.TrimSpace(requestID)
}

func (s *Service) RequireRecoveryResolutionChallenge(ctx context.Context, actorID int64, requestID, action string) error {
	_, enabled, err := s.GetTOTPEnabled(ctx, actorID)
	if err != nil {
		return err
	}
	if !enabled {
		return ErrRecoveryChallengeMethodRequired
	}

	key := recoveryChallengeKey(requestID, action)
	now := time.Now()
	s.recoveryMu.Lock()
	s.cleanupRecoveryRequestsLocked(now)
	challenge, hasChallenge := s.recoveryChallenges[actorID]
	s.recoveryMu.Unlock()

	mfaStatus, err := s.GetMFARequired(ctx, actorID)
	if err != nil {
		return err
	}
	if hasChallenge && challenge.Key == key && now.Before(challenge.ExpireAt) && !mfaStatus.Required {
		return nil
	}

	if err := s.SetMFARequired(ctx, actorID, true); err != nil {
		return err
	}
	s.recoveryMu.Lock()
	s.recoveryChallenges[actorID] = recoveryChallengeJob{
		Key:      key,
		ExpireAt: now.Add(recoveryChallengeTTL),
	}
	s.recoveryMu.Unlock()
	return ErrRecoveryChallengeRequired
}

func (s *Service) ConsumeRecoveryResolutionChallenge(actorID int64, requestID, action string) {
	key := recoveryChallengeKey(requestID, action)
	s.recoveryMu.Lock()
	defer s.recoveryMu.Unlock()
	if challenge, ok := s.recoveryChallenges[actorID]; ok && challenge.Key == key {
		delete(s.recoveryChallenges, actorID)
	}
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
