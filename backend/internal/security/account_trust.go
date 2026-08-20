package security

import (
	"context"
	"errors"
	"time"

	"github.com/skaia/backend/models"
)

const (
	ProvisionalWindow        = 30 * time.Minute
	ReasonAccountProvisional = "account_provisional"
)

type AccountTier string

const (
	TierGuest       AccountTier = "guest"
	TierProvisional AccountTier = "provisional"
	TierEstablished AccountTier = "established"
	TierPrivileged  AccountTier = "privileged"
)

var (
	ErrAccountProvisional = errors.New(ReasonAccountProvisional)
	ErrAccountUnavailable = errors.New("account trust unavailable")
)

type TrustDecision struct {
	Tier             AccountTier `json:"tier"`
	Established      bool        `json:"established"`
	TOTPEnabled      bool        `json:"totp_enabled"`
	UnlockAt         *time.Time  `json:"unlock_at,omitempty"`
	RemainingSeconds int64       `json:"remaining_seconds"`
}

type accountReader interface {
	GetByID(id int64) (*models.User, error)
}

type totpReader interface {
	GetTOTPEnabled(ctx context.Context, userID int64) (string, bool, error)
}

// AccountTrustPolicy is the single server-owned authority for the initial
// account cooldown. It intentionally derives trust from persisted account data,
// never token issue time or frontend state.
type AccountTrustPolicy struct {
	users accountReader
	totp  totpReader
	now   func() time.Time
}

func NewAccountTrustPolicy(users accountReader, totp totpReader) *AccountTrustPolicy {
	return &AccountTrustPolicy{users: users, totp: totp, now: time.Now}
}

func (p *AccountTrustPolicy) withClock(now func() time.Time) *AccountTrustPolicy {
	p.now = now
	return p
}

func (p *AccountTrustPolicy) Evaluate(ctx context.Context, userID int64) (TrustDecision, error) {
	if userID == 0 {
		decision := TrustDecision{Tier: TierGuest}
		DefaultSafeguardTelemetry.RecordDecision(decision.Tier)
		return decision, nil
	}
	if p == nil || p.users == nil || p.totp == nil || p.now == nil {
		return TrustDecision{}, ErrAccountUnavailable
	}

	user, err := p.users.GetByID(userID)
	if err != nil || user == nil || user.ID != userID || user.CreatedAt.IsZero() || user.IsSuspended {
		return TrustDecision{}, ErrAccountUnavailable
	}
	_, enabled, err := p.totp.GetTOTPEnabled(ctx, userID)
	if err != nil {
		return TrustDecision{}, ErrAccountUnavailable
	}

	now := p.now().UTC()
	unlockAt := user.CreatedAt.UTC().Add(ProvisionalWindow)
	if enabled || !now.Before(unlockAt) {
		decision := TrustDecision{Tier: TierEstablished, Established: true, TOTPEnabled: enabled}
		DefaultSafeguardTelemetry.RecordDecision(decision.Tier)
		return decision, nil
	}

	remaining := int64(unlockAt.Sub(now).Seconds())
	if remaining < 1 {
		remaining = 1
	}
	decision := TrustDecision{
		Tier:             TierProvisional,
		TOTPEnabled:      false,
		UnlockAt:         &unlockAt,
		RemainingSeconds: remaining,
	}
	DefaultSafeguardTelemetry.RecordDecision(decision.Tier)
	return decision, nil
}

func (p *AccountTrustPolicy) RequireEstablished(ctx context.Context, userID int64) (TrustDecision, error) {
	decision, err := p.Evaluate(ctx, userID)
	if err != nil {
		return TrustDecision{}, err
	}
	if !decision.Established {
		return decision, ErrAccountProvisional
	}
	return decision, nil
}
