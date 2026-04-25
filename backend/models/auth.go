package models

import "time"

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
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         *User  `json:"user"`
	ExpiresIn    int    `json:"expires_in"`
	RequiresTOTP bool   `json:"requires_totp,omitempty"`
	TOTPToken    string `json:"totp_token,omitempty"`
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
