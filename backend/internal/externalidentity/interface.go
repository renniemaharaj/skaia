package externalidentity

import (
	"context"
	"time"
)

type Repository interface {
	ListProviders(context.Context) ([]Provider, error)
	GetProvider(context.Context, string) (*Provider, error)
	CreateProvider(context.Context, int64, CreateProviderRequest) (*Provider, error)
	CreateChallenge(context.Context, int64, int64, []byte, []byte, string, string, time.Time) error
	GetChallenge(context.Context, []byte) (*Challenge, error)
	CompleteChallenge(context.Context, []byte, int64, time.Time) (*Link, error)
	ListOwn(context.Context, int64) ([]Link, error)
	ListPublic(context.Context, int64) ([]Link, error)
	SetVisibility(context.Context, int64, int64, bool) (*Link, error)
	Unlink(context.Context, int64, int64) error
}

type Adapter interface {
	Instructions(subject string) string
	Verify(context.Context, string, string) error
}

type TrustPolicy func(context.Context, int64) error
type PermissionPolicy func(int64, string) (bool, error)
