package rewards

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

type fakeRepo struct {
	grant       *Grant
	replay      bool
	err         error
	reward      *Redemption
	claimed     []Fulfilment
	completions []bool
}

func (f *fakeRepo) ProviderAdapter(context.Context, string) (string, error) {
	return "reference", f.err
}

func (f *fakeRepo) CreateProvider(context.Context, int64, CreateProviderRequest) (*Provider, error) {
	return &Provider{}, nil
}
func (f *fakeRepo) CreateRule(context.Context, int64, CreateRuleRequest) (*Rule, error) {
	return &Rule{}, nil
}
func (f *fakeRepo) CreateReward(context.Context, int64, CreateRewardRequest) (*Reward, error) {
	return &Reward{}, nil
}
func (f *fakeRepo) Ingest(_ context.Context, _ string, event, payload []byte, _ ProviderEvent) (*Grant, bool, error) {
	if len(event) != sha256.Size || len(payload) != sha256.Size {
		return nil, false, errors.New("expected hashed event identity and payload")
	}
	return f.grant, f.replay, f.err
}
func (f *fakeRepo) ListCatalog(context.Context) ([]Reward, error) { return []Reward{}, nil }
func (f *fakeRepo) Account(context.Context, int64, int) (Account, error) {
	return Account{Balance: 10}, nil
}
func (f *fakeRepo) Redeem(context.Context, int64, int64, []byte, []byte) (*Redemption, bool, error) {
	return f.reward, f.replay, f.err
}
func (f *fakeRepo) Claim(context.Context, string, time.Duration, int) ([]Fulfilment, error) {
	v := f.claimed
	f.claimed = nil
	return v, nil
}
func (f *fakeRepo) Complete(_ context.Context, _ int64, _ string, ok bool, _ string, _ time.Duration) error {
	f.completions = append(f.completions, ok)
	return nil
}
func (f *fakeRepo) Retry(context.Context, int64) error { return f.err }

func signature(secret []byte, ts string, body []byte) string {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(ts))
	m.Write([]byte("."))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}
func TestAuthenticatedIngestAndReplayProjection(t *testing.T) {
	secret := []byte("01234567890123456789012345678901")
	now := time.Date(2026, 8, 23, 12, 0, 0, 0, time.UTC)
	repo := &fakeRepo{grant: &Grant{ID: 1}, replay: true}
	svc := NewService(repo, nil, map[string]EventAuthenticator{"reference": HMACAuthenticator{Secret: secret, Window: 5 * time.Minute}}, nil)
	svc.now = func() time.Time { return now }
	body := []byte(`{"id":"evt-1","type":"activity","subject":"account-7","occurred_at":"2026-08-23T12:00:00Z"}`)
	grant, replay, err := svc.Ingest(context.Background(), "reference", now.Format(time.RFC3339), signature(secret, now.Format(time.RFC3339), body), body)
	require.NoError(t, err)
	assert.True(t, replay)
	assert.Equal(t, int64(1), grant.ID)
}
func TestIngestRejectsStaleOrInvalidSignature(t *testing.T) {
	secret := []byte("01234567890123456789012345678901")
	now := time.Now().UTC()
	svc := NewService(&fakeRepo{}, nil, map[string]EventAuthenticator{"reference": HMACAuthenticator{Secret: secret, Window: time.Minute}}, nil)
	svc.now = func() time.Time { return now }
	body := []byte(`{"id":"evt-1","type":"activity","subject":"account-7","occurred_at":"2026-08-23T12:00:00Z"}`)
	_, _, err := svc.Ingest(context.Background(), "reference", now.Add(-2*time.Minute).Format(time.RFC3339), "bad", body)
	assert.ErrorIs(t, err, ErrDenied)
}
func TestDeliveryLeaseOutcomeIsRecorded(t *testing.T) {
	repo := &fakeRepo{claimed: []Fulfilment{{ID: 1, RedemptionID: 2, AdapterKey: "reference"}, {ID: 2, RedemptionID: 3, AdapterKey: "missing"}}}
	svc := NewService(repo, nil, nil, map[string]DeliveryAdapter{"reference": ReferenceDelivery{Enabled: true}})
	require.NoError(t, svc.Process(context.Background(), "worker-a"))
	assert.Equal(t, []bool{true, false}, repo.completions)
}
func TestOperatorRecoveryFailsClosed(t *testing.T) {
	svc := NewService(&fakeRepo{}, nil, nil, nil)
	assert.ErrorIs(t, svc.Retry(context.Background(), 1, 2), ErrDenied)
	svc = NewService(&fakeRepo{err: errors.New("no")}, func(int64, string) (bool, error) { return true, nil }, nil, nil)
	assert.EqualError(t, svc.Retry(context.Background(), 1, 2), "no")
}

func TestAccountProjectsEmptyProviderCollectionsAsArrays(t *testing.T) {
	svc := NewService(&fakeRepo{}, nil, nil, nil)
	account, err := svc.Account(context.Background(), 7)
	require.NoError(t, err)
	assert.NotNil(t, account.Grants)
	assert.NotNil(t, account.Redemptions)
}
