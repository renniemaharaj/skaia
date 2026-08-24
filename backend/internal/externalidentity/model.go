package externalidentity

import "time"

type Provider struct {
	ID                   int64     `json:"id"`
	Key                  string    `json:"key"`
	Name                 string    `json:"name"`
	AdapterKey           string    `json:"-"`
	Enabled              bool      `json:"enabled"`
	PublicDisplayAllowed bool      `json:"public_display_allowed"`
	CreatedAt            time.Time `json:"created_at"`
}

type Link struct {
	ID          int64      `json:"id"`
	ProviderID  int64      `json:"provider_id"`
	ProviderKey string     `json:"provider_key"`
	Provider    string     `json:"provider"`
	UserID      int64      `json:"-"`
	Subject     string     `json:"subject"`
	DisplayName string     `json:"display_name"`
	Public      bool       `json:"public"`
	VerifiedAt  time.Time  `json:"verified_at"`
	Reverified  *time.Time `json:"reverified_at,omitempty"`
	UnlinkedAt  *time.Time `json:"-"`
}

// PublicIdentity is the deliberate profile projection. Opaque provider
// subjects, internal IDs and lifecycle metadata never cross this boundary.
type PublicIdentity struct {
	ProviderKey string    `json:"provider_key"`
	Provider    string    `json:"provider"`
	DisplayName string    `json:"display_name"`
	VerifiedAt  time.Time `json:"verified_at"`
}

type Challenge struct {
	ID          int64
	ProviderID  int64
	ProviderKey string
	AdapterKey  string
	UserID      int64
	TokenHash   []byte
	SessionHash []byte
	Subject     string
	DisplayName string
	ExpiresAt   time.Time
	ConsumedAt  *time.Time
}

type ChallengeResponse struct {
	Token        string    `json:"token"`
	ProviderKey  string    `json:"provider_key"`
	Instructions string    `json:"instructions"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type CreateProviderRequest struct {
	Key                  string `json:"key"`
	Name                 string `json:"name"`
	AdapterKey           string `json:"adapter_key"`
	Enabled              bool   `json:"enabled"`
	PublicDisplayAllowed bool   `json:"public_display_allowed"`
}
