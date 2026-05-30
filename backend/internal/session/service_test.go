package session

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── In-memory repository for unit tests ─────────────────────────────────

type fakeRepository struct {
	sessions map[string]*Session
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{sessions: make(map[string]*Session)}
}

func (r *fakeRepository) Create(_ context.Context, s *Session) (*Session, error) {
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now
	r.sessions[s.ID] = s
	return s, nil
}

func (r *fakeRepository) GetByID(_ context.Context, id string) (*Session, error) {
	s, ok := r.sessions[id]
	if !ok || time.Now().After(s.ExpiresAt) {
		return nil, sql.ErrNoRows
	}
	return s, nil
}

func (r *fakeRepository) GetByUserID(_ context.Context, userID int64) ([]*Session, error) {
	var result []*Session
	for _, s := range r.sessions {
		if s.UserID == userID && time.Now().Before(s.ExpiresAt) {
			result = append(result, s)
		}
	}
	return result, nil
}

func (r *fakeRepository) UpdateLastSeenIP(_ context.Context, id, ip string) error {
	s, ok := r.sessions[id]
	if !ok {
		return sql.ErrNoRows
	}
	s.LastSeenIP = ip
	s.UpdatedAt = time.Now()
	return nil
}

func (r *fakeRepository) MarkVerified(_ context.Context, id string) error {
	s, ok := r.sessions[id]
	if !ok {
		return sql.ErrNoRows
	}
	s.Verified = true
	s.UpdatedAt = time.Now()
	return nil
}

func (r *fakeRepository) DeleteByID(_ context.Context, id string) error {
	delete(r.sessions, id)
	return nil
}

func (r *fakeRepository) DeleteByUserID(_ context.Context, userID int64) error {
	for id, s := range r.sessions {
		if s.UserID == userID {
			delete(r.sessions, id)
		}
	}
	return nil
}

func (r *fakeRepository) DeleteExpired(_ context.Context) (int64, error) {
	var count int64
	now := time.Now()
	for id, s := range r.sessions {
		if now.After(s.ExpiresAt) {
			delete(r.sessions, id)
			count++
		}
	}
	return count, nil
}

// ── Tests ────────────────────────────────────────────────────────────────

func newTestService() *Service {
	svc := &Service{
		repo:               newFakeRepository(),
		turnstileSiteKey:   "",
		turnstileSecretKey: "",
	}
	return svc
}

func newTestServiceWithTurnstile() *Service {
	svc := &Service{
		repo:               newFakeRepository(),
		turnstileSiteKey:   "test-site-key",
		turnstileSecretKey: "test-secret-key",
	}
	return svc
}

func TestCreateSession(t *testing.T) {
	svc := newTestService()
	sess, err := svc.CreateSession(context.Background(), 42, "1.2.3.4", "Mozilla/5.0", 30*time.Minute)
	require.NoError(t, err)
	require.NotEmpty(t, sess.ID)
	assert.Equal(t, int64(42), sess.UserID)
	assert.Equal(t, "1.2.3.4", sess.CreatedIP)
	assert.Equal(t, "1.2.3.4", sess.LastSeenIP)
	assert.NotEmpty(t, sess.UserAgentHash)
	assert.True(t, sess.Verified)
	assert.True(t, sess.ExpiresAt.After(time.Now()))
}

func TestValidateSession_SameIP_Success(t *testing.T) {
	svc := newTestService()
	sess, _ := svc.CreateSession(context.Background(), 42, "1.2.3.4", "Mozilla/5.0", 30*time.Minute)

	result, err := svc.ValidateSession(context.Background(), sess.ID, "1.2.3.4")
	require.NoError(t, err)
	assert.Equal(t, sess.ID, result.ID)
}

func TestValidateSession_DifferentIP_NoTurnstile_SoftAllow(t *testing.T) {
	svc := newTestService() // No Turnstile configured
	sess, _ := svc.CreateSession(context.Background(), 42, "1.2.3.4", "Mozilla/5.0", 30*time.Minute)

	result, err := svc.ValidateSession(context.Background(), sess.ID, "5.6.7.8")
	require.NoError(t, err)
	assert.Equal(t, sess.ID, result.ID)
	// Verify IP was updated
	updated, _ := svc.repo.GetByID(context.Background(), sess.ID)
	assert.Equal(t, "5.6.7.8", updated.LastSeenIP)
}

func TestValidateSession_DifferentIP_WithTurnstile_StepUpRequired(t *testing.T) {
	svc := newTestServiceWithTurnstile()
	sess, _ := svc.CreateSession(context.Background(), 42, "1.2.3.4", "Mozilla/5.0", 30*time.Minute)

	_, err := svc.ValidateSession(context.Background(), sess.ID, "5.6.7.8")
	assert.True(t, errors.Is(err, ErrStepUpRequired))
}

func TestValidateSession_NotFound(t *testing.T) {
	svc := newTestService()
	_, err := svc.ValidateSession(context.Background(), "nonexistent", "1.2.3.4")
	assert.True(t, errors.Is(err, ErrSessionNotFound))
}

func TestDeleteSession(t *testing.T) {
	svc := newTestService()
	sess, _ := svc.CreateSession(context.Background(), 42, "1.2.3.4", "Mozilla/5.0", 30*time.Minute)
	require.NoError(t, svc.DeleteSession(context.Background(), sess.ID))
	_, err := svc.ValidateSession(context.Background(), sess.ID, "1.2.3.4")
	assert.Error(t, err)
}

func TestDeleteUserSessions(t *testing.T) {
	svc := newTestService()
	svc.CreateSession(context.Background(), 42, "1.2.3.4", "Mozilla/5.0", 30*time.Minute)
	svc.CreateSession(context.Background(), 42, "1.2.3.5", "Chrome/100", 30*time.Minute)

	require.NoError(t, svc.DeleteUserSessions(context.Background(), 42))

	sessions, _ := svc.GetUserSessions(context.Background(), 42)
	assert.Empty(t, sessions)
}

func TestTurnstileConfig(t *testing.T) {
	svc := newTestService()
	assert.False(t, svc.TurnstileEnabled())
	assert.Nil(t, svc.GetTurnstileConfig())

	svcWithTurnstile := newTestServiceWithTurnstile()
	assert.True(t, svcWithTurnstile.TurnstileEnabled())
	cfg := svcWithTurnstile.GetTurnstileConfig()
	require.NotNil(t, cfg)
	assert.Equal(t, "test-site-key", cfg.SiteKey)
}

func TestHashUserAgent(t *testing.T) {
	h1 := hashUserAgent("Mozilla/5.0")
	h2 := hashUserAgent("Mozilla/5.0")
	h3 := hashUserAgent("Chrome/100")
	assert.Equal(t, h1, h2)
	assert.NotEqual(t, h1, h3)
	assert.Len(t, h1, 64) // SHA-256 hex digest
}

func TestRealClientIP(t *testing.T) {
	tests := []struct {
		name     string
		headers  map[string]string
		remote   string
		expected string
	}{
		{"CF-Connecting-IP", map[string]string{"CF-Connecting-IP": "1.1.1.1"}, "9.9.9.9:1234", "1.1.1.1"},
		{"X-Real-Ip", map[string]string{"X-Real-Ip": "2.2.2.2"}, "9.9.9.9:1234", "2.2.2.2"},
		{"X-Forwarded-For single", map[string]string{"X-Forwarded-For": "3.3.3.3"}, "9.9.9.9:1234", "3.3.3.3"},
		{"X-Forwarded-For multi", map[string]string{"X-Forwarded-For": "4.4.4.4, 5.5.5.5"}, "9.9.9.9:1234", "4.4.4.4"},
		{"RemoteAddr", map[string]string{}, "6.6.6.6:8080", "6.6.6.6"},
		{"CF-Connecting-IP priority", map[string]string{"CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "2.2.2.2"}, "9.9.9.9:1234", "1.1.1.1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest("GET", "/", nil)
			req.RemoteAddr = tt.remote
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			assert.Equal(t, tt.expected, RealClientIP(req))
		})
	}
}
