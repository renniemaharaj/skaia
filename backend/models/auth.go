package models

import "time"

// Credential represents a user's authentication credential (password hash).
type Credential struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TOTPSecret represents a user's TOTP secret for 2FA.
type TOTPSecret struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Secret    string    `json:"-"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BackupCode represents a one-time-use backup code for 2FA.
type BackupCode struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	CodeHash  string    `json:"-"`
	Used      bool      `json:"used"`
	CreatedAt time.Time `json:"created_at"`
}

// RegisterRequest represents a user registration request.
type RegisterRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// LoginRequest represents a user login request.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	TOTPCode string `json:"totp_code,omitempty"`
}

// RefreshRequest represents a token refresh request.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// AuthResponse represents the response after login/register.
type AuthResponse struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	User         *AuthUser `json:"user"`
	ExpiresIn    int       `json:"expires_in"`
	RequiresTOTP bool      `json:"requires_totp,omitempty"`
	TOTPToken    string    `json:"totp_token,omitempty"`
}

// AuthUser is the user profile shape returned by auth flows. It deliberately
// keeps auth-derived response state out of the core User model.
type AuthUser struct {
	User
	TOTPEnabled bool `json:"totp_enabled"`
}

func NewAuthUser(user *User, totpEnabled bool) *AuthUser {
	if user == nil {
		return nil
	}
	return &AuthUser{User: *user, TOTPEnabled: totpEnabled}
}

// EmailVerificationToken is used to verify a user's email address.
type EmailVerificationToken struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// PasswordResetToken is used for email-based password recovery.
type PasswordResetToken struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	Used      bool      `json:"used"`
	CreatedAt time.Time `json:"created_at"`
}

// TOTPBackupCode is a one-time-use recovery code for 2FA.
type TOTPBackupCode struct {
	ID       int64  `json:"id"`
	UserID   int64  `json:"user_id"`
	CodeHash string `json:"-"`
	Used     bool   `json:"used"`
}

type MFAChallengeStatus struct {
	UserID    int64     `json:"user_id"`
	Required  bool      `json:"required"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
