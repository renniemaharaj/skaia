package events

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestDispatchAndProcess ensures jobs dispatched on the conveyor belt are
// picked up by workers and their Fn is executed.
func TestDispatchAndProcess(t *testing.T) {
	d := NewDispatcher(nil)
	d.Start()

	var counter int64
	var wg sync.WaitGroup
	n := 10
	wg.Add(n)
	for i := 0; i < n; i++ {
		d.Dispatch(Job{
			UserID:   1,
			Activity: ActUserRegistered,
			Fn: func() {
				atomic.AddInt64(&counter, 1)
				wg.Done()
			},
		})
	}
	wg.Wait()
	d.Stop()

	if got := atomic.LoadInt64(&counter); got != int64(n) {
		t.Fatalf("expected Fn called %d times, got %d", n, got)
	}
}

// TestDispatchAfterStop verifies that Dispatch handles stopped state safely.
func TestDispatchAfterStop(t *testing.T) {
	d := NewDispatcher(nil)
	d.Start()
	d.Stop()

	// Should not panic and should be silently dropped.
	d.Dispatch(Job{Activity: ActUserRegistered})
}

// TestFnPanicRecovery verifies the worker recovers from a panicking Fn.
func TestFnPanicRecovery(t *testing.T) {
	d := NewDispatcher(nil)
	d.Start()

	done := make(chan struct{})
	// First: panicking job
	d.Dispatch(Job{
		Activity: "panic_job",
		Fn:       func() { panic("boom") },
	})
	// Second: normal job that signals completion
	d.Dispatch(Job{
		Activity: "ok_job",
		Fn:       func() { close(done) },
	})

	select {
	case <-done:
		// Worker survived the panic and processed the next job.
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for job after panic — worker did not recover")
	}
	d.Stop()
}
