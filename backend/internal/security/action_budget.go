package security

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

var ErrBudgetUnavailable = errors.New("action budget unavailable")

type budgetStore interface {
	Increment(ctx context.Context, key string, cost int64, window time.Duration) (count int64, ttl time.Duration, err error)
}

type redisBudgetStore struct{ client *redis.Client }

var incrementBudgetScript = redis.NewScript(`
local count = redis.call('INCRBY', KEYS[1], ARGV[1])
if count == tonumber(ARGV[1]) then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`)

func (s redisBudgetStore) Increment(ctx context.Context, key string, cost int64, window time.Duration) (int64, time.Duration, error) {
	if s.client == nil {
		return 0, 0, ErrBudgetUnavailable
	}
	result, err := incrementBudgetScript.Run(ctx, s.client, []string{key}, cost, window.Milliseconds()).Result()
	if err != nil {
		return 0, 0, err
	}
	values, ok := result.([]any)
	if !ok || len(values) != 2 {
		return 0, 0, ErrBudgetUnavailable
	}
	count, okCount := values[0].(int64)
	ttlMS, okTTL := values[1].(int64)
	if !okCount || !okTTL {
		return 0, 0, ErrBudgetUnavailable
	}
	return count, time.Duration(ttlMS) * time.Millisecond, nil
}

type ActionBudget struct {
	store  budgetStore
	tenant string
}

func NewActionBudget(client *redis.Client, tenant string) *ActionBudget {
	tenant = strings.TrimSpace(tenant)
	if tenant == "" {
		tenant = "default"
	}
	return &ActionBudget{store: redisBudgetStore{client: client}, tenant: tenant}
}

func (b *ActionBudget) Allow(ctx context.Context, scope, identity string, cost, limit int64, window time.Duration) (time.Duration, error) {
	if b == nil || b.store == nil || identity == "" || scope == "" || cost < 1 || limit < 1 || window <= 0 {
		return 0, ErrBudgetUnavailable
	}
	key := fmt.Sprintf("skaia:budget:%s:%s:%s", b.tenant, scope, identity)
	count, ttl, err := b.store.Increment(ctx, key, cost, window)
	if err != nil {
		return 0, ErrBudgetUnavailable
	}
	if count > limit {
		if ttl < time.Second {
			ttl = time.Second
		}
		return ttl, ErrAccountRateLimited
	}
	return 0, nil
}

var ErrAccountRateLimited = errors.New("action rate limited")
