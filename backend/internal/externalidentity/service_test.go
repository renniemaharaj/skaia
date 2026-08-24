package externalidentity

import (
	"context"
	"errors"
	"testing"
	"time"
)

type memoryRepository struct {
	provider  Provider
	challenge *Challenge
	link      *Link
	completed bool
}

func (r *memoryRepository) ListProviders(context.Context) ([]Provider, error) {
	return []Provider{r.provider}, nil
}
func (r *memoryRepository) GetProvider(_ context.Context, key string) (*Provider, error) {
	if key != r.provider.Key {
		return nil, errors.New("missing")
	}
	p := r.provider
	return &p, nil
}
func (r *memoryRepository) CreateProvider(context.Context, int64, CreateProviderRequest) (*Provider, error) {
	return nil, nil
}
func (r *memoryRepository) CreateChallenge(_ context.Context, providerID, userID int64, hash, sessionHash []byte, subject, display string, expires time.Time) error {
	r.challenge = &Challenge{ProviderID: providerID, ProviderKey: r.provider.Key, AdapterKey: r.provider.AdapterKey, UserID: userID, TokenHash: append([]byte(nil), hash...), SessionHash: append([]byte(nil), sessionHash...), Subject: subject, DisplayName: display, ExpiresAt: expires}
	return nil
}
func (r *memoryRepository) GetChallenge(_ context.Context, hash []byte) (*Challenge, error) {
	if r.challenge == nil || string(hash) != string(r.challenge.TokenHash) {
		return nil, errors.New("missing")
	}
	copy := *r.challenge
	return &copy, nil
}
func (r *memoryRepository) CompleteChallenge(_ context.Context, _ []byte, userID int64, now time.Time) (*Link, error) {
	if r.completed {
		return nil, ErrChallengeInvalid
	}
	r.completed = true
	r.challenge.ConsumedAt = &now
	r.link = &Link{ID: 1, ProviderID: r.provider.ID, ProviderKey: r.provider.Key, Provider: r.provider.Name, UserID: userID, Subject: r.challenge.Subject, DisplayName: r.challenge.DisplayName, VerifiedAt: now}
	return r.link, nil
}
func (r *memoryRepository) ListOwn(context.Context, int64) ([]Link, error) { return nil, nil }
func (r *memoryRepository) ListPublic(context.Context, int64) ([]Link, error) {
	if r.link == nil {
		return nil, nil
	}
	return []Link{*r.link}, nil
}
func (r *memoryRepository) SetVisibility(context.Context, int64, int64, bool) (*Link, error) {
	return nil, nil
}
func (r *memoryRepository) Unlink(context.Context, int64, int64) error { return nil }

func testService(repo *memoryRepository) *Service {
	service := NewService(repo, func(context.Context, int64) error { return nil }, func(int64, string) (bool, error) { return true, nil }, map[string]Adapter{"reference": ReferenceAdapter{Enabled: true}})
	service.now = func() time.Time { return time.Date(2026, 8, 23, 12, 0, 0, 0, time.UTC) }
	return service
}

func TestChallengeIsOwnerBoundAndSingleUse(t *testing.T) {
	repo := &memoryRepository{provider: Provider{ID: 4, Key: "game", Name: "Game account", AdapterKey: "reference", Enabled: true}}
	service := testService(repo)
	sessionHash := make([]byte, 32)
	challenge, err := service.Start(context.Background(), 7, sessionHash, "game", "player-42", "Player 42")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Complete(context.Background(), 8, sessionHash, challenge.Token, "verified:player-42"); !errors.Is(err, ErrChallengeInvalid) {
		t.Fatalf("cross-account completion = %v", err)
	}
	otherSession := make([]byte, 32)
	otherSession[0] = 1
	if _, err = service.Complete(context.Background(), 7, otherSession, challenge.Token, "verified:player-42"); !errors.Is(err, ErrChallengeInvalid) {
		t.Fatalf("cross-session completion = %v", err)
	}
	link, err := service.Complete(context.Background(), 7, sessionHash, challenge.Token, "verified:player-42")
	if err != nil {
		t.Fatal(err)
	}
	if link.Subject != "player-42" || link.Public {
		t.Fatalf("unexpected link: %#v", link)
	}
	if _, err = service.Complete(context.Background(), 7, sessionHash, challenge.Token, "verified:player-42"); !errors.Is(err, ErrChallengeInvalid) {
		t.Fatalf("replay = %v", err)
	}
}

func TestChallengeExpiryAndProofFailClosed(t *testing.T) {
	repo := &memoryRepository{provider: Provider{ID: 4, Key: "game", Name: "Game account", AdapterKey: "reference", Enabled: true}}
	service := testService(repo)
	sessionHash := make([]byte, 32)
	challenge, err := service.Start(context.Background(), 7, sessionHash, "game", "player-42", "Player 42")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Complete(context.Background(), 7, sessionHash, challenge.Token, "wrong"); !errors.Is(err, ErrChallengeInvalid) {
		t.Fatalf("invalid proof = %v", err)
	}
	service.now = func() time.Time { return challenge.ExpiresAt }
	if _, err = service.Complete(context.Background(), 7, sessionHash, challenge.Token, "verified:player-42"); !errors.Is(err, ErrChallengeInvalid) {
		t.Fatalf("expired challenge = %v", err)
	}
}

func TestReferenceAdapterMustBeExplicitlyEnabled(t *testing.T) {
	adapter := ReferenceAdapter{}
	if err := adapter.Verify(context.Background(), "subject", "verified:subject"); !errors.Is(err, ErrAdapterDisabled) {
		t.Fatalf("disabled adapter = %v", err)
	}
}

func TestPublicProjectionExcludesOpaqueSubject(t *testing.T) {
	repo := &memoryRepository{link: &Link{ProviderKey: "game", Provider: "Game", Subject: "opaque-private-id", DisplayName: "Player", VerifiedAt: time.Now()}}
	public, err := testService(repo).ListPublic(context.Background(), 7)
	if err != nil {
		t.Fatal(err)
	}
	if len(public) != 1 || public[0].DisplayName != "Player" {
		t.Fatalf("unexpected public projection: %#v", public)
	}
}
