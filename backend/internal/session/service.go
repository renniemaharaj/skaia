package session

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionExpired  = errors.New("session expired")
	ErrStepUpRequired  = errors.New("step-up authentication required")
)

// Service contains the business logic for session management
// and Turnstile step-up verification.
type Service struct {
	repo            Repository
	turnstileSiteKey   string
	turnstileSecretKey string
}

// NewService creates a session service. Turnstile keys are read
// from environment variables TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.
func NewService(repo Repository) *Service {
	return &Service{
		repo:               repo,
		turnstileSiteKey:   os.Getenv("TURNSTILE_SITE_KEY"),
		turnstileSecretKey: os.Getenv("TURNSTILE_SECRET_KEY"),
	}
}

// TurnstileEnabled returns true when both site and secret keys are configured.
func (s *Service) TurnstileEnabled() bool {
	return s.turnstileSiteKey != "" && s.turnstileSecretKey != ""
}

// GetTurnstileConfig returns the public site key for the frontend.
func (s *Service) GetTurnstileConfig() *TurnstileConfig {
	if s.turnstileSiteKey == "" {
		return nil
	}
	return &TurnstileConfig{SiteKey: s.turnstileSiteKey}
}

// CreateSession builds and persists a new session from login context.
func (s *Service) CreateSession(ctx context.Context, userID int64, ip, userAgent string, ttl time.Duration) (*Session, error) {
	now := time.Now()
	sess := &Session{
		ID:            uuid.New().String(),
		UserID:        userID,
		CreatedIP:     ip,
		LastSeenIP:    ip,
		UserAgentHash: hashUserAgent(userAgent),
		IssuedAt:      now,
		ExpiresAt:     now.Add(ttl),
		Verified:      true, // Initial login is trusted
	}
	return s.repo.Create(ctx, sess)
}

// ValidateSession checks session validity and performs IP comparison.
// Returns the session and nil error if the IP matches.
// Returns the session and ErrStepUpRequired if the IP changed
// and Turnstile is configured. The caller should prompt the user
// to complete a challenge.
func (s *Service) ValidateSession(ctx context.Context, sessionID, currentIP string) (*Session, error) {
	sess, err := s.repo.GetByID(ctx, sessionID)
	if err != nil {
		return nil, ErrSessionNotFound
	}
	if time.Now().After(sess.ExpiresAt) {
		return nil, ErrSessionExpired
	}

	// Same IP - update last-seen and continue
	if sess.LastSeenIP == currentIP || sess.CreatedIP == currentIP {
		if sess.LastSeenIP != currentIP {
			_ = s.repo.UpdateLastSeenIP(ctx, sessionID, currentIP)
		}
		return sess, nil
	}

	// IP changed - require step-up if Turnstile is configured
	if s.TurnstileEnabled() {
		return sess, ErrStepUpRequired
	}

	// Turnstile not configured - soft-allow but update IP
	_ = s.repo.UpdateLastSeenIP(ctx, sessionID, currentIP)
	return sess, nil
}

// VerifyTurnstileToken calls Cloudflare's siteverify endpoint to validate
// a Turnstile token. On success, it updates the session's last_seen_ip.
func (s *Service) VerifyTurnstileToken(ctx context.Context, sessionID, token, remoteIP string) error {
	if !s.TurnstileEnabled() {
		return errors.New("turnstile not configured")
	}

	resp, err := verifyWithCloudflare(s.turnstileSecretKey, token, remoteIP)
	if err != nil {
		return fmt.Errorf("turnstile verification failed: %w", err)
	}
	if !resp.Success {
		return fmt.Errorf("turnstile challenge failed: %v", resp.ErrorCodes)
	}

	// Challenge passed - update session IP and mark verified
	if err := s.repo.UpdateLastSeenIP(ctx, sessionID, remoteIP); err != nil {
		return err
	}
	return s.repo.MarkVerified(ctx, sessionID)
}

// DeleteSession removes a specific session.
func (s *Service) DeleteSession(ctx context.Context, id string) error {
	return s.repo.DeleteByID(ctx, id)
}

// DeleteUserSessions removes all sessions for a user (e.g. on logout-all).
func (s *Service) DeleteUserSessions(ctx context.Context, userID int64) error {
	return s.repo.DeleteByUserID(ctx, userID)
}

// CleanupExpired removes expired sessions. Intended to be called periodically.
func (s *Service) CleanupExpired(ctx context.Context) {
	n, err := s.repo.DeleteExpired(ctx)
	if err != nil {
		log.Printf("session.CleanupExpired: %v", err)
		return
	}
	if n > 0 {
		log.Printf("session.CleanupExpired: removed %d expired sessions", n)
	}
}

// GetUserSessions returns all active sessions for a user.
func (s *Service) GetUserSessions(ctx context.Context, userID int64) ([]*Session, error) {
	return s.repo.GetByUserID(ctx, userID)
}

// Helpers

// hashUserAgent produces a hex SHA-256 digest of the User-Agent string.
func hashUserAgent(ua string) string {
	h := sha256.Sum256([]byte(ua))
	return fmt.Sprintf("%x", h)
}

// RealClientIP extracts the client IP using the Cloudflare-preferred
// CF-Connecting-IP header, falling back through X-Real-Ip and X-Forwarded-For
// before using RemoteAddr.
func RealClientIP(r *http.Request) string {
	// Best source when behind Cloudflare proxy
	if cfIP := r.Header.Get("CF-Connecting-IP"); cfIP != "" {
		return strings.TrimSpace(cfIP)
	}
	if xri := r.Header.Get("X-Real-Ip"); xri != "" {
		return strings.TrimSpace(xri)
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// verifyWithCloudflare calls the Cloudflare Turnstile siteverify endpoint.
func verifyWithCloudflare(secretKey, token, remoteIP string) (*TurnstileVerifyResponse, error) {
	payload := fmt.Sprintf("secret=%s&response=%s&remoteip=%s", secretKey, token, remoteIP)
	resp, err := http.Post(
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		"application/x-www-form-urlencoded",
		strings.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result TurnstileVerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}
