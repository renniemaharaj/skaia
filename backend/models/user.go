package models

import "time"

// User represents a user in the system.
type User struct {
	ID              int64      `json:"id"`
	Username        string     `json:"username"`
	Email           string     `json:"email"`
	PasswordHash    string     `json:"-"`
	DisplayName     string     `json:"display_name"`
	AvatarURL       string     `json:"avatar_url"`
	BannerURL       string     `json:"banner_url"`
	PhotoURL        string     `json:"photo_url"`
	Bio             string     `json:"bio"`
	DiscordID       *string    `json:"discord_id"`
	IsSuspended     bool       `json:"is_suspended"`
	SuspendedAt     *time.Time `json:"suspended_at"`
	SuspendedReason *string    `json:"suspended_reason"`
	EmailVerified   bool       `json:"email_verified"`
	EmailVerifiedAt *time.Time `json:"email_verified_at,omitempty"`
	TOTPEnabled     bool       `json:"totp_enabled"`
	TOTPSecret      string     `json:"totp_secret,omitempty"`
	Roles           []string   `json:"roles"`
	Permissions     []string   `json:"permissions"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// UserBlock represents a user blocking another user.
type UserBlock struct {
	ID        int64     `json:"id"`
	BlockerID int64     `json:"blocker_id"`
	BlockedID int64     `json:"blocked_id"`
	CreatedAt time.Time `json:"created_at"`
}
