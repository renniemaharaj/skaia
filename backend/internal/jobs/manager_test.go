package jobs

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestManagerDispatchTracksSuccessfulJob(t *testing.T) {
	m := NewManager(Config{Kind: "test", Workers: 1, Buffer: 2, TTL: time.Minute}, func(ctx context.Context, payload int) (int, error) {
		return payload * 2, nil
	})
	m.Start()
	defer m.Stop()

	snap, resultCh, ok := m.DispatchWithResult(7, 21)
	if !ok {
		t.Fatal("expected dispatch to succeed")
	}
	res := <-resultCh
	if res.Err != nil {
		t.Fatalf("unexpected error: %v", res.Err)
	}
	if res.Value != 42 {
		t.Fatalf("result = %d, want 42", res.Value)
	}

	got, ok := m.Get(snap.ID)
	if !ok {
		t.Fatal("expected tracked job")
	}
	if got.State != StateSucceeded {
		t.Fatalf("state = %s, want %s", got.State, StateSucceeded)
	}
	if got.Result == nil || *got.Result != 42 {
		t.Fatalf("snapshot result = %#v, want 42", got.Result)
	}
	if got.OwnerID != 7 {
		t.Fatalf("owner = %d, want 7", got.OwnerID)
	}
}

func TestManagerTracksHandlerErrorsAndPanics(t *testing.T) {
	m := NewManager(Config{Kind: "test", Workers: 1, Buffer: 2, TTL: time.Minute}, func(ctx context.Context, payload string) (string, error) {
		if payload == "panic" {
			panic("boom")
		}
		return "", errors.New("failed")
	})
	m.Start()
	defer m.Stop()

	errSnap, errCh, ok := m.DispatchWithResult(0, "error")
	if !ok {
		t.Fatal("expected error job dispatch")
	}
	if res := <-errCh; res.Err == nil {
		t.Fatal("expected handler error")
	}
	got, ok := m.Get(errSnap.ID)
	if !ok || got.State != StateFailed || got.Error == "" {
		t.Fatalf("expected failed error snapshot, got %#v ok=%v", got, ok)
	}

	panicSnap, panicCh, ok := m.DispatchWithResult(0, "panic")
	if !ok {
		t.Fatal("expected panic job dispatch")
	}
	if res := <-panicCh; res.Err == nil {
		t.Fatal("expected panic converted to error")
	}
	got, ok = m.Get(panicSnap.ID)
	if !ok || got.State != StateFailed || got.Error == "" {
		t.Fatalf("expected failed panic snapshot, got %#v ok=%v", got, ok)
	}
}

func TestManagerRejectsDispatchAfterStop(t *testing.T) {
	m := NewManager(Config{Kind: "test", Workers: 1, Buffer: 1, TTL: time.Minute}, func(ctx context.Context, payload int) (int, error) {
		return payload, nil
	})
	m.Start()
	m.Stop()

	if _, ok := m.Dispatch(0, 1); ok {
		t.Fatal("expected dispatch after stop to fail")
	}
}
