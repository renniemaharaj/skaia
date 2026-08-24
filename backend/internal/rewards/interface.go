package rewards

import (
	"context"
	"time"
)

type Repository interface {
	ProviderAdapter(context.Context, string) (string, error)
	CreateProvider(context.Context, int64, CreateProviderRequest) (*Provider, error)
	CreateRule(context.Context, int64, CreateRuleRequest) (*Rule, error)
	CreateReward(context.Context, int64, CreateRewardRequest) (*Reward, error)
	Ingest(context.Context, string, []byte, []byte, ProviderEvent) (*Grant, bool, error)
	ListCatalog(context.Context) ([]Reward, error)
	Account(context.Context, int64, int) (Account, error)
	Redeem(context.Context, int64, int64, []byte, []byte) (*Redemption, bool, error)
	Claim(context.Context, string, time.Duration, int) ([]Fulfilment, error)
	Complete(context.Context, int64, string, bool, string, time.Duration) error
	Retry(context.Context, int64) error
}
type PermissionPolicy func(int64, string) (bool, error)
type EventAuthenticator interface {
	Verify(timestamp, signature string, body []byte, now time.Time) error
}
type DeliveryAdapter interface {
	Deliver(context.Context, int64, []byte) error
}
