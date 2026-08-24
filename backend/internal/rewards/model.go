package rewards

import "time"

type Provider struct {
	ID         int64  `json:"id"`
	Key        string `json:"key"`
	Name       string `json:"name"`
	AdapterKey string `json:"-"`
	Enabled    bool   `json:"enabled"`
}
type Rule struct {
	ID         int64  `json:"id"`
	ProviderID int64  `json:"provider_id"`
	EventType  string `json:"event_type"`
	Version    int    `json:"version"`
	Points     int64  `json:"points"`
	Enabled    bool   `json:"enabled"`
}
type Reward struct {
	ID              int64  `json:"id"`
	Key             string `json:"key"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Cost            int64  `json:"cost"`
	DeliveryAdapter string `json:"-"`
	DeliveryPayload []byte `json:"-"`
	Enabled         bool   `json:"enabled"`
}
type Grant struct {
	ID        int64     `json:"id"`
	EventID   int64     `json:"-"`
	UserID    int64     `json:"-"`
	EventType string    `json:"event_type"`
	Points    int64     `json:"points"`
	CreatedAt time.Time `json:"created_at"`
}
type Redemption struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"-"`
	RewardID   int64     `json:"reward_id"`
	RewardName string    `json:"reward_name"`
	Cost       int64     `json:"cost"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
type Account struct {
	Balance     int64        `json:"balance"`
	Grants      []Grant      `json:"grants"`
	Redemptions []Redemption `json:"redemptions"`
}
type ProviderEvent struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"`
	Subject    string    `json:"subject"`
	OccurredAt time.Time `json:"occurred_at"`
}
type Fulfilment struct {
	ID           int64
	RedemptionID int64
	AdapterKey   string
	Payload      []byte
	Attempts     int
}
type CreateProviderRequest struct {
	Key        string `json:"key"`
	Name       string `json:"name"`
	AdapterKey string `json:"adapter_key"`
	Enabled    bool   `json:"enabled"`
}
type CreateRuleRequest struct {
	ProviderKey string `json:"provider_key"`
	EventType   string `json:"event_type"`
	Version     int    `json:"version"`
	Points      int64  `json:"points"`
	Enabled     bool   `json:"enabled"`
}
type CreateRewardRequest struct {
	Key             string         `json:"key"`
	Name            string         `json:"name"`
	Description     string         `json:"description"`
	Cost            int64          `json:"cost"`
	DeliveryAdapter string         `json:"delivery_adapter"`
	DeliveryPayload map[string]any `json:"delivery_payload"`
	Enabled         bool           `json:"enabled"`
}
