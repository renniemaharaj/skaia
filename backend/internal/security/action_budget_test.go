package security

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeBudgetStore struct {
	count int64
	err   error
}

func (f *fakeBudgetStore) Increment(context.Context, string, int64, time.Duration) (int64, time.Duration, error) {
	if f.err != nil {
		return 0, 0, f.err
	}
	f.count++
	return f.count, 9 * time.Second, nil
}

func TestActionBudgetIsSharedAcrossCalls(t *testing.T) {
	store := &fakeBudgetStore{}
	budget := &ActionBudget{store: store, tenant: "tenant-a"}
	if _, err := budget.Allow(context.Background(), "chat:guest", "ip:1", 1, 1, time.Minute); err != nil {
		t.Fatal(err)
	}
	retry, err := budget.Allow(context.Background(), "chat:guest", "ip:1", 1, 1, time.Minute)
	if !errors.Is(err, ErrAccountRateLimited) || retry != 9*time.Second {
		t.Fatalf("second call = %s, %v", retry, err)
	}
}

func TestActionBudgetFailsClosed(t *testing.T) {
	budget := &ActionBudget{store: &fakeBudgetStore{err: errors.New("redis down")}, tenant: "tenant-a"}
	if _, err := budget.Allow(context.Background(), "write", "user:1", 1, 1, time.Minute); !errors.Is(err, ErrBudgetUnavailable) {
		t.Fatalf("error = %v", err)
	}
}
