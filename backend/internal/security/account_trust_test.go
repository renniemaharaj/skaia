package security

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/skaia/backend/models"
)

type trustUsers struct {
	user *models.User
	err  error
}

func (f trustUsers) GetByID(int64) (*models.User, error) { return f.user, f.err }

type trustTOTP struct {
	enabled bool
	err     error
}

func (f trustTOTP) GetTOTPEnabled(context.Context, int64) (string, bool, error) {
	return "", f.enabled, f.err
}

func TestAccountTrustPolicyDecisionTable(t *testing.T) {
	now := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name      string
		createdAt time.Time
		totp      bool
		want      AccountTier
		remaining int64
	}{
		{name: "just registered", createdAt: now, want: TierProvisional, remaining: 1800},
		{name: "before boundary", createdAt: now.Add(-ProvisionalWindow + time.Second), want: TierProvisional, remaining: 1},
		{name: "at boundary", createdAt: now.Add(-ProvisionalWindow), want: TierEstablished},
		{name: "after boundary", createdAt: now.Add(-ProvisionalWindow - time.Second), want: TierEstablished},
		{name: "totp unlock", createdAt: now, totp: true, want: TierEstablished},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			policy := NewAccountTrustPolicy(
				trustUsers{user: &models.User{ID: 7, CreatedAt: tc.createdAt}},
				trustTOTP{enabled: tc.totp},
			).withClock(func() time.Time { return now })
			got, err := policy.Evaluate(context.Background(), 7)
			if err != nil {
				t.Fatalf("Evaluate: %v", err)
			}
			if got.Tier != tc.want || got.RemainingSeconds != tc.remaining {
				t.Fatalf("decision = %#v, want tier %q remaining %d", got, tc.want, tc.remaining)
			}
		})
	}
}

func TestAccountTrustPolicyFailsClosed(t *testing.T) {
	now := time.Now().UTC()
	cases := []struct {
		name  string
		users trustUsers
		totp  trustTOTP
	}{
		{name: "user lookup", users: trustUsers{err: errors.New("db unavailable")}},
		{name: "missing timestamp", users: trustUsers{user: &models.User{ID: 7}}},
		{name: "suspended", users: trustUsers{user: &models.User{ID: 7, CreatedAt: now, IsSuspended: true}}},
		{name: "totp lookup", users: trustUsers{user: &models.User{ID: 7, CreatedAt: now}}, totp: trustTOTP{err: errors.New("db unavailable")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			policy := NewAccountTrustPolicy(tc.users, tc.totp).withClock(func() time.Time { return now })
			if _, err := policy.RequireEstablished(context.Background(), 7); !errors.Is(err, ErrAccountUnavailable) {
				t.Fatalf("RequireEstablished error = %v", err)
			}
		})
	}
}

func TestGuestTrustDecision(t *testing.T) {
	decision, err := (*AccountTrustPolicy)(nil).Evaluate(context.Background(), 0)
	if err != nil || decision.Tier != TierGuest {
		t.Fatalf("guest decision = %#v, %v", decision, err)
	}
}
