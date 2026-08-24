package externalidentity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var (
	ErrDenied           = errors.New("external identity operation denied")
	ErrValidation       = errors.New("invalid external identity request")
	ErrChallengeInvalid = errors.New("external identity challenge is invalid")
	ErrAdapterDisabled  = errors.New("external identity adapter unavailable")
)

var providerKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,63}$`)

type Service struct {
	repo       Repository
	trust      TrustPolicy
	permission PermissionPolicy
	adapters   map[string]Adapter
	now        func() time.Time
}

func NewService(repo Repository, trust TrustPolicy, permission PermissionPolicy, adapters map[string]Adapter) *Service {
	copyAdapters := make(map[string]Adapter, len(adapters))
	for key, adapter := range adapters {
		copyAdapters[key] = adapter
	}
	return &Service{repo: repo, trust: trust, permission: permission, adapters: copyAdapters, now: time.Now}
}

func (s *Service) ListProviders(ctx context.Context) ([]Provider, error) {
	return s.repo.ListProviders(ctx)
}

func (s *Service) CreateProvider(ctx context.Context, actorID int64, request CreateProviderRequest) (*Provider, error) {
	allowed, err := s.permission(actorID, "home.manage")
	if err != nil || !allowed {
		return nil, ErrDenied
	}
	request.Key = strings.ToLower(strings.TrimSpace(request.Key))
	request.Name = strings.TrimSpace(request.Name)
	request.AdapterKey = strings.ToLower(strings.TrimSpace(request.AdapterKey))
	if !providerKeyPattern.MatchString(request.Key) || len(request.Name) < 2 || len(request.Name) > 80 || s.adapters[request.AdapterKey] == nil {
		return nil, ErrValidation
	}
	return s.repo.CreateProvider(ctx, actorID, request)
}

func (s *Service) Start(ctx context.Context, userID int64, sessionHash []byte, providerKey, subject, displayName string) (*ChallengeResponse, error) {
	if s.trust == nil || s.trust(ctx, userID) != nil {
		return nil, ErrDenied
	}
	providerKey = strings.ToLower(strings.TrimSpace(providerKey))
	subject = strings.TrimSpace(subject)
	displayName = strings.TrimSpace(displayName)
	if len(sessionHash) != sha256.Size || !providerKeyPattern.MatchString(providerKey) || len(subject) < 1 || len(subject) > 255 || len(displayName) < 1 || len(displayName) > 120 {
		return nil, ErrValidation
	}
	provider, err := s.repo.GetProvider(ctx, providerKey)
	if err != nil {
		return nil, ErrValidation
	}
	adapter := s.adapters[provider.AdapterKey]
	if adapter == nil {
		return nil, ErrAdapterDisabled
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	expiresAt := s.now().UTC().Add(10 * time.Minute)
	if err := s.repo.CreateChallenge(ctx, provider.ID, userID, hash[:], sessionHash, subject, displayName, expiresAt); err != nil {
		return nil, err
	}
	return &ChallengeResponse{Token: token, ProviderKey: provider.Key, Instructions: adapter.Instructions(subject), ExpiresAt: expiresAt}, nil
}

func (s *Service) Complete(ctx context.Context, userID int64, sessionHash []byte, token, proof string) (*Link, error) {
	if s.trust == nil || s.trust(ctx, userID) != nil {
		return nil, ErrDenied
	}
	if len(sessionHash) != sha256.Size || len(token) < 32 || len(token) > 128 || len(proof) < 1 || len(proof) > 512 {
		return nil, ErrChallengeInvalid
	}
	hash := sha256.Sum256([]byte(token))
	challenge, err := s.repo.GetChallenge(ctx, hash[:])
	if err != nil || challenge.UserID != userID || !equalHash(challenge.SessionHash, sessionHash) || challenge.ConsumedAt != nil || !s.now().UTC().Before(challenge.ExpiresAt) {
		return nil, ErrChallengeInvalid
	}
	adapter := s.adapters[challenge.AdapterKey]
	if adapter == nil {
		return nil, ErrAdapterDisabled
	}
	if err := adapter.Verify(ctx, challenge.Subject, proof); err != nil {
		return nil, ErrChallengeInvalid
	}
	return s.repo.CompleteChallenge(ctx, hash[:], userID, s.now().UTC())
}

func equalHash(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	var difference byte
	for index := range left {
		difference |= left[index] ^ right[index]
	}
	return difference == 0
}

func (s *Service) ListOwn(ctx context.Context, userID int64) ([]Link, error) {
	return s.repo.ListOwn(ctx, userID)
}
func (s *Service) ListPublic(ctx context.Context, userID int64) ([]PublicIdentity, error) {
	if userID <= 0 {
		return nil, ErrValidation
	}
	links, err := s.repo.ListPublic(ctx, userID)
	if err != nil {
		return nil, err
	}
	public := make([]PublicIdentity, 0, len(links))
	for _, link := range links {
		public = append(public, PublicIdentity{ProviderKey: link.ProviderKey, Provider: link.Provider, DisplayName: link.DisplayName, VerifiedAt: link.VerifiedAt})
	}
	return public, nil
}

func (s *Service) SetVisibility(ctx context.Context, userID, linkID int64, public bool) (*Link, error) {
	if s.trust == nil || s.trust(ctx, userID) != nil || linkID <= 0 {
		return nil, ErrDenied
	}
	return s.repo.SetVisibility(ctx, userID, linkID, public)
}

func (s *Service) Unlink(ctx context.Context, userID, linkID int64) error {
	if s.trust == nil || s.trust(ctx, userID) != nil || linkID <= 0 {
		return ErrDenied
	}
	return s.repo.Unlink(ctx, userID, linkID)
}

type ReferenceAdapter struct{ Enabled bool }

func (a ReferenceAdapter) Instructions(subject string) string {
	return fmt.Sprintf("Development adapter: enter verified:%s to complete this link.", subject)
}

func (a ReferenceAdapter) Verify(_ context.Context, subject, proof string) error {
	if !a.Enabled {
		return ErrAdapterDisabled
	}
	if proof != "verified:"+subject {
		return ErrChallengeInvalid
	}
	return nil
}
