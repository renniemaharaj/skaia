package rewards

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var (
	ErrDenied       = errors.New("reward operation denied")
	ErrValidation   = errors.New("invalid reward request")
	ErrConflict     = errors.New("reward replay conflict")
	ErrInsufficient = errors.New("insufficient reward points")
)
var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,63}$`)

type Service struct {
	repo           Repository
	permission     PermissionPolicy
	authenticators map[string]EventAuthenticator
	delivery       map[string]DeliveryAdapter
	now            func() time.Time
}

func NewService(repo Repository, permission PermissionPolicy, auth map[string]EventAuthenticator, delivery map[string]DeliveryAdapter) *Service {
	return &Service{repo: repo, permission: permission, authenticators: auth, delivery: delivery, now: time.Now}
}
func (s *Service) operator(id int64) bool {
	if s.permission == nil {
		return false
	}
	ok, err := s.permission(id, "home.manage")
	return err == nil && ok
}
func (s *Service) CreateProvider(ctx context.Context, id int64, r CreateProviderRequest) (*Provider, error) {
	r.Key = strings.ToLower(strings.TrimSpace(r.Key))
	r.Name = strings.TrimSpace(r.Name)
	r.AdapterKey = strings.ToLower(strings.TrimSpace(r.AdapterKey))
	if !s.operator(id) {
		return nil, ErrDenied
	}
	if !keyPattern.MatchString(r.Key) || len(r.Name) < 2 || len(r.Name) > 80 || s.authenticators[r.AdapterKey] == nil {
		return nil, ErrValidation
	}
	return s.repo.CreateProvider(ctx, id, r)
}
func (s *Service) CreateRule(ctx context.Context, id int64, r CreateRuleRequest) (*Rule, error) {
	r.ProviderKey = strings.ToLower(strings.TrimSpace(r.ProviderKey))
	r.EventType = strings.ToLower(strings.TrimSpace(r.EventType))
	if !s.operator(id) {
		return nil, ErrDenied
	}
	if !keyPattern.MatchString(r.ProviderKey) || !keyPattern.MatchString(r.EventType) || r.Version < 1 || r.Points < 1 {
		return nil, ErrValidation
	}
	return s.repo.CreateRule(ctx, id, r)
}
func (s *Service) CreateReward(ctx context.Context, id int64, r CreateRewardRequest) (*Reward, error) {
	r.Key = strings.ToLower(strings.TrimSpace(r.Key))
	r.Name = strings.TrimSpace(r.Name)
	r.DeliveryAdapter = strings.ToLower(strings.TrimSpace(r.DeliveryAdapter))
	if !s.operator(id) {
		return nil, ErrDenied
	}
	if !keyPattern.MatchString(r.Key) || len(r.Name) < 2 || len(r.Name) > 100 || len(r.Description) > 500 || r.Cost < 1 || s.delivery[r.DeliveryAdapter] == nil {
		return nil, ErrValidation
	}
	return s.repo.CreateReward(ctx, id, r)
}
func (s *Service) Ingest(ctx context.Context, provider, timestamp, signature string, body []byte) (*Grant, bool, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	adapterKey, err := s.repo.ProviderAdapter(ctx, provider)
	if err != nil {
		return nil, false, ErrDenied
	}
	a := s.authenticators[adapterKey]
	if a == nil || len(body) == 0 || len(body) > 64<<10 {
		return nil, false, ErrDenied
	}
	if err := a.Verify(timestamp, signature, body, s.now().UTC()); err != nil {
		return nil, false, ErrDenied
	}
	var event ProviderEvent
	if json.Unmarshal(body, &event) != nil || len(event.ID) < 1 || len(event.ID) > 255 || !keyPattern.MatchString(strings.ToLower(event.Type)) || len(event.Subject) < 1 || len(event.Subject) > 255 || event.OccurredAt.IsZero() {
		return nil, false, ErrValidation
	}
	identity := sha256.Sum256([]byte(event.ID))
	payload := sha256.Sum256(body)
	return s.repo.Ingest(ctx, provider, identity[:], payload[:], event)
}
func (s *Service) Catalog(ctx context.Context) ([]Reward, error) { return s.repo.ListCatalog(ctx) }
func (s *Service) Account(ctx context.Context, userID int64) (Account, error) {
	if userID <= 0 {
		return Account{}, ErrDenied
	}
	account, err := s.repo.Account(ctx, userID, 100)
	if account.Grants == nil {
		account.Grants = []Grant{}
	}
	if account.Redemptions == nil {
		account.Redemptions = []Redemption{}
	}
	return account, err
}
func (s *Service) Redeem(ctx context.Context, userID, rewardID int64, key string) (*Redemption, bool, error) {
	if userID <= 0 || rewardID <= 0 || len(key) < 16 || len(key) > 128 {
		return nil, false, ErrValidation
	}
	kh := sha256.Sum256([]byte(key))
	rh := sha256.Sum256([]byte(fmt.Sprintf("%d:%d", userID, rewardID)))
	return s.repo.Redeem(ctx, userID, rewardID, kh[:], rh[:])
}
func (s *Service) Process(ctx context.Context, owner string) error {
	for i := 0; i < 10; i++ {
		jobs, err := s.repo.Claim(ctx, owner, 30*time.Second, 25)
		if err != nil {
			return err
		}
		if len(jobs) == 0 {
			return nil
		}
		for _, job := range jobs {
			a := s.delivery[job.AdapterKey]
			var deliver error
			if a == nil {
				deliver = errors.New("delivery adapter unavailable")
			} else {
				deliver = a.Deliver(ctx, job.RedemptionID, job.Payload)
			}
			if deliver != nil {
				retry := time.Minute * time.Duration(1<<min(job.Attempts, 6))
				if err = s.repo.Complete(ctx, job.ID, owner, false, deliver.Error(), retry); err != nil {
					return err
				}
			} else if err = s.repo.Complete(ctx, job.ID, owner, true, "", 0); err != nil {
				return err
			}
		}
	}
	return nil
}
func (s *Service) Retry(ctx context.Context, actorID, redemptionID int64) error {
	if !s.operator(actorID) {
		return ErrDenied
	}
	return s.repo.Retry(ctx, redemptionID)
}

type HMACAuthenticator struct {
	Secret []byte
	Window time.Duration
}

func (a HMACAuthenticator) Verify(ts, sig string, body []byte, now time.Time) error {
	parsed, err := time.Parse(time.RFC3339, ts)
	if err != nil || len(a.Secret) < 32 || now.Sub(parsed) > a.Window || parsed.Sub(now) > a.Window {
		return ErrDenied
	}
	mac := hmac.New(sha256.New, a.Secret)
	mac.Write([]byte(ts))
	mac.Write([]byte("."))
	mac.Write(body)
	given, err := hex.DecodeString(sig)
	if err != nil || !hmac.Equal(given, mac.Sum(nil)) {
		return ErrDenied
	}
	return nil
}

type ReferenceDelivery struct{ Enabled bool }

func (a ReferenceDelivery) Deliver(_ context.Context, _ int64, _ []byte) error {
	if !a.Enabled {
		return errors.New("reference delivery disabled")
	}
	return nil
}
