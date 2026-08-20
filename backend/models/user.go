package models

import "time"

// User represents a user in the system.
type User struct {
	ID                 int64      `json:"id"`
	Username           string     `json:"username"`
	Email              string     `json:"email"`
	DisplayName        string     `json:"display_name"`
	AvatarURL          string     `json:"avatar_url"`
	BannerURL          string     `json:"banner_url"`
	PhotoURL           string     `json:"photo_url"`
	Bio                string     `json:"bio"`
	DiscordID          *string    `json:"discord_id"`
	IsSuspended        bool       `json:"is_suspended"`
	SuspendedAt        *time.Time `json:"suspended_at"`
	SuspendedReason    *string    `json:"suspended_reason"`
	EmailVerified      bool       `json:"email_verified"`
	EmailVerifiedAt    *time.Time `json:"email_verified_at,omitempty"`
	Roles              []string   `json:"roles"`
	Permissions        []string   `json:"permissions"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	BackgroundImageURL *string    `json:"background_image_url,omitempty"`
	BackgroundVideoURL *string    `json:"background_video_url,omitempty"`
	BackgroundPosition *string    `json:"background_position,omitempty"`
	FontFamily         *string    `json:"font_family,omitempty"`
	ProfileCardArtURL  *string    `json:"profile_card_art_url,omitempty"`
}

// PublicUserProfile is the deliberate guest-safe projection used by profile
// and batch lookup endpoints. Authentication, contact, suspension and
// permission state never cross this boundary.
type PublicUserProfile struct {
	ID                 int64     `json:"id"`
	Username           string    `json:"username"`
	DisplayName        string    `json:"display_name"`
	AvatarURL          string    `json:"avatar_url"`
	BannerURL          string    `json:"banner_url"`
	PhotoURL           string    `json:"photo_url"`
	Bio                string    `json:"bio"`
	Roles              []string  `json:"roles"`
	CreatedAt          time.Time `json:"created_at"`
	BackgroundImageURL *string   `json:"background_image_url,omitempty"`
	BackgroundVideoURL *string   `json:"background_video_url,omitempty"`
	BackgroundPosition *string   `json:"background_position,omitempty"`
	FontFamily         *string   `json:"font_family,omitempty"`
	ProfileCardArtURL  *string   `json:"profile_card_art_url,omitempty"`
}

func NewPublicUserProfile(user *User) PublicUserProfile {
	return PublicUserProfile{
		ID: user.ID, Username: user.Username, DisplayName: user.DisplayName,
		AvatarURL: user.AvatarURL, BannerURL: user.BannerURL, PhotoURL: user.PhotoURL,
		Bio: user.Bio, Roles: append([]string(nil), user.Roles...), CreatedAt: user.CreatedAt,
		BackgroundImageURL: user.BackgroundImageURL, BackgroundVideoURL: user.BackgroundVideoURL,
		BackgroundPosition: user.BackgroundPosition, FontFamily: user.FontFamily,
		ProfileCardArtURL: user.ProfileCardArtURL,
	}
}

// UserBlock represents a user blocking another user.
type UserBlock struct {
	ID        int64     `json:"id"`
	BlockerID int64     `json:"blocker_id"`
	BlockedID int64     `json:"blocked_id"`
	CreatedAt time.Time `json:"created_at"`
}

// UserSummary contains a lightweight representation of a user.
type UserSummary struct {
	ID          int64  `json:"id"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}
