package session

import "time"

// Session represents a stateful session record that tracks metadata
// for IP-aware validation and step-up authentication.
type Session struct {
	ID            string    `json:"id"`
	UserID        int64     `json:"user_id"`
	CreatedIP     string    `json:"created_ip"`
	LastSeenIP    string    `json:"last_seen_ip"`
	UserAgentHash string    `json:"user_agent_hash"`
	IssuedAt      time.Time `json:"issued_at"`
	ExpiresAt     time.Time `json:"expires_at"`
	Verified      bool      `json:"verified"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// TurnstileConfig holds the public site key for a tenant's
// Cloudflare Turnstile integration. The secret key is never
// exposed via this struct.
type TurnstileConfig struct {
	SiteKey string `json:"site_key"`
}

// StepUpResponse is returned when the middleware detects
// an IP mismatch and requires the client to complete a
// Turnstile challenge before proceeding.
type StepUpResponse struct {
	StepUpRequired bool   `json:"step_up_required"`
	Message        string `json:"message"`
	SessionID      string `json:"session_id,omitempty"`
}

// TurnstileVerifyRequest is the payload sent by the frontend
// after the user completes a Turnstile challenge.
type TurnstileVerifyRequest struct {
	Token     string `json:"token"`
	SessionID string `json:"session_id"`
}

// TurnstileVerifyResponse is the response from Cloudflare's
// siteverify endpoint.
type TurnstileVerifyResponse struct {
	Success     bool     `json:"success"`
	ChallengeTS string   `json:"challenge_ts,omitempty"`
	Hostname    string   `json:"hostname,omitempty"`
	ErrorCodes  []string `json:"error-codes,omitempty"`
}
