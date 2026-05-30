package auth

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func TestServiceRegisterAndLoginUseAuthCredentials(t *testing.T) {
	svc, repo, users := newTestService()

	req := &models.RegisterRequest{
		Username:    "tester",
		Email:       "tester@example.com",
		Password:    "CorrectHorse1!",
		DisplayName: "Tester",
	}
	user, accessToken, refreshToken, err := svc.Register(context.Background(), req)
	require.NoError(t, err)
	require.NotZero(t, user.ID)
	require.NotEmpty(t, accessToken)
	require.NotEmpty(t, refreshToken)

	cred, err := repo.GetCredentialByUserID(context.Background(), user.ID)
	require.NoError(t, err)
	require.NotEqual(t, req.Password, cred.PasswordHash)
	require.NoError(t, bcrypt.CompareHashAndPassword([]byte(cred.PasswordHash), []byte(req.Password)))
	require.Equal(t, user.ID, users.byEmail[req.Email].ID)

	loggedIn, loginToken, err := svc.Login(context.Background(), req.Email, req.Password)
	require.NoError(t, err)
	require.Equal(t, user.ID, loggedIn.ID)
	require.NotEmpty(t, loginToken)

	_, _, err = svc.Login(context.Background(), req.Email, "wrong-password")
	require.Error(t, err)
}

func TestServiceTOTPAndBackupCodesStayInAuthStore(t *testing.T) {
	svc, repo, users := newTestService()
	user := users.mustCreate(t, "mfa@example.com")

	secret, err := svc.GenerateTOTPSecret(context.Background(), user.ID)
	require.NoError(t, err)
	require.NotEmpty(t, secret)

	code, err := totp.GenerateCode(secret, time.Now())
	require.NoError(t, err)
	backupCodes, err := svc.EnableTOTP(context.Background(), user.ID, code)
	require.NoError(t, err)
	require.Len(t, backupCodes, 10)

	storedSecret, enabled, err := svc.GetTOTPEnabled(context.Background(), user.ID)
	require.NoError(t, err)
	require.Equal(t, secret, storedSecret)
	require.True(t, enabled)
	require.Len(t, repo.backupCodes[user.ID], 10)

	ok, err := svc.ValidateTOTPBackupCode(context.Background(), user.ID, backupCodes[0])
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = svc.ValidateTOTPBackupCode(context.Background(), user.ID, backupCodes[0])
	require.NoError(t, err)
	require.False(t, ok, "backup code must be one-time-use")

	require.NoError(t, repo.CreateCredentialHash(user.ID, "CorrectHorse1!"))
	require.NoError(t, svc.DisableTOTP(context.Background(), user.ID, "CorrectHorse1!"))
	_, enabled, err = svc.GetTOTPEnabled(context.Background(), user.ID)
	require.NoError(t, err)
	require.False(t, enabled)
	require.Empty(t, repo.backupCodes[user.ID])
}

type fakeUserService struct {
	nextID  int64
	byID    map[int64]*models.User
	byEmail map[string]*models.User
}

func newFakeUserService() *fakeUserService {
	return &fakeUserService{
		nextID:  1,
		byID:    map[int64]*models.User{},
		byEmail: map[string]*models.User{},
	}
}

func (s *fakeUserService) mustCreate(t *testing.T, email string) *models.User {
	t.Helper()
	user, err := s.CreateUserFromRegisterRequest(&models.RegisterRequest{
		Username:    "user" + email[:1],
		Email:       email,
		DisplayName: "Test User",
	})
	require.NoError(t, err)
	return user
}

func (s *fakeUserService) CreateUserFromRegisterRequest(req *models.RegisterRequest) (*models.User, error) {
	user := &models.User{
		ID:          s.nextID,
		Username:    req.Username,
		Email:       req.Email,
		DisplayName: req.DisplayName,
		Roles:       []string{"member"},
		Permissions: []string{},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	s.nextID++
	s.byID[user.ID] = user
	s.byEmail[user.Email] = user
	return user, nil
}

func (s *fakeUserService) GetByID(id int64) (*models.User, error) {
	user, ok := s.byID[id]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (s *fakeUserService) GetByEmail(email string) (*models.User, error) {
	user, ok := s.byEmail[email]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}
func (s *fakeUserService) HasPermission(userID int64, permission string) (bool, error) {
	return true, nil // For tests, just return true
}

func newTestService() (*Service, *fakeAuthRepository, *fakeUserService) {
	repo := newFakeAuthRepository()
	users := newFakeUserService()
	return NewService(repo, users), repo, users
}

type fakeAuthRepository struct {
	nextID      int64
	credentials map[int64]*models.Credential
	totpSecrets map[int64]*models.TOTPSecret
	backupCodes map[int64][]*models.BackupCode
	mfaStatuses map[int64]models.MFAChallengeStatus
}

func newFakeAuthRepository() *fakeAuthRepository {
	return &fakeAuthRepository{
		nextID:      1,
		credentials: map[int64]*models.Credential{},
		totpSecrets: map[int64]*models.TOTPSecret{},
		backupCodes: map[int64][]*models.BackupCode{},
		mfaStatuses: map[int64]models.MFAChallengeStatus{},
	}
}

func (r *fakeAuthRepository) next() int64 {
	id := r.nextID
	r.nextID++
	return id
}

func (r *fakeAuthRepository) CreateCredentialHash(userID int64, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = r.CreateCredential(context.Background(), userID, string(hash))
	return err
}

func (r *fakeAuthRepository) CreateCredential(ctx context.Context, userID int64, passwordHash string) (*models.Credential, error) {
	cred := &models.Credential{
		ID:           r.next(),
		UserID:       userID,
		PasswordHash: passwordHash,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	r.credentials[userID] = cred
	return cred, nil
}

func (r *fakeAuthRepository) GetCredentialByUserID(ctx context.Context, userID int64) (*models.Credential, error) {
	cred, ok := r.credentials[userID]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cred, nil
}

func (r *fakeAuthRepository) UpdatePasswordHash(ctx context.Context, userID int64, newHash string) error {
	cred, ok := r.credentials[userID]
	if !ok {
		return sql.ErrNoRows
	}
	cred.PasswordHash = newHash
	cred.UpdatedAt = time.Now()
	return nil
}



func (r *fakeAuthRepository) CreateTOTPSecret(ctx context.Context, userID int64, secret string) (*models.TOTPSecret, error) {
	existing, ok := r.totpSecrets[userID]
	if ok {
		existing.Secret = secret
		existing.Enabled = false
		existing.UpdatedAt = time.Now()
		return existing, nil
	}
	totpSecret := &models.TOTPSecret{
		ID:        r.next(),
		UserID:    userID,
		Secret:    secret,
		Enabled:   false,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	r.totpSecrets[userID] = totpSecret
	return totpSecret, nil
}

func (r *fakeAuthRepository) GetTOTPSecretByUserID(ctx context.Context, userID int64) (*models.TOTPSecret, error) {
	totpSecret, ok := r.totpSecrets[userID]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return totpSecret, nil
}

func (r *fakeAuthRepository) SetTOTPEnabled(ctx context.Context, userID int64, enabled bool) error {
	totpSecret, ok := r.totpSecrets[userID]
	if !ok {
		return sql.ErrNoRows
	}
	totpSecret.Enabled = enabled
	totpSecret.UpdatedAt = time.Now()
	return nil
}

func (r *fakeAuthRepository) GetTOTPEnabled(ctx context.Context, userID int64) (bool, error) {
	totpSecret, ok := r.totpSecrets[userID]
	if !ok {
		return false, sql.ErrNoRows
	}
	return totpSecret.Enabled, nil
}

func (r *fakeAuthRepository) CreateBackupCodes(ctx context.Context, userID int64, codeHashes []string) error {
	codes := make([]*models.BackupCode, 0, len(codeHashes))
	for _, hash := range codeHashes {
		codes = append(codes, &models.BackupCode{
			ID:        r.next(),
			UserID:    userID,
			CodeHash:  hash,
			CreatedAt: time.Now(),
		})
	}
	r.backupCodes[userID] = append(r.backupCodes[userID], codes...)
	return nil
}

func (r *fakeAuthRepository) GetBackupCodes(ctx context.Context, userID int64) ([]*models.BackupCode, error) {
	return r.backupCodes[userID], nil
}

func (r *fakeAuthRepository) UseBackupCode(ctx context.Context, codeID int64) error {
	for _, codes := range r.backupCodes {
		for _, code := range codes {
			if code.ID == codeID {
				code.Used = true
				return nil
			}
		}
	}
	return sql.ErrNoRows
}

func (r *fakeAuthRepository) DeleteBackupCodes(ctx context.Context, userID int64) error {
	delete(r.backupCodes, userID)
	return nil
}

func (r *fakeAuthRepository) SetMFARequired(ctx context.Context, userID int64, required bool) error {
	r.mfaStatuses[userID] = models.MFAChallengeStatus{
		UserID:    userID,
		Required:  required,
		UpdatedAt: time.Now(),
	}
	return nil
}

func (r *fakeAuthRepository) GetMFARequired(ctx context.Context, userID int64) (models.MFAChallengeStatus, error) {
	status, ok := r.mfaStatuses[userID]
	if !ok {
		return models.MFAChallengeStatus{
			UserID:   userID,
			Required: true,
		}, nil
	}
	return status, nil
}
