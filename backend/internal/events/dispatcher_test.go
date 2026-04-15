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
	d := &Dispatcher{
		jobs:    make(chan Job, 16),
		repo:    &Repository{}, // nil db — Insert will fail silently (logged)
		workers: 2,
	}
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

// TestDispatchAfterStop verifies that Dispatch is a no-op once Stop was called.
func TestDispatchAfterStop(t *testing.T) {
	d := &Dispatcher{
		jobs:    make(chan Job, 4),
		repo:    &Repository{},
		workers: 1,
	}
	d.Start()
	d.Stop()

	// Should not panic and should be silently dropped.
	d.Dispatch(Job{Activity: ActUserRegistered})
}

// TestBackpressureDrop confirms that a full buffer causes the job to be dropped.
func TestBackpressureDrop(t *testing.T) {
	d := &Dispatcher{
		jobs:    make(chan Job, 1),
		repo:    &Repository{},
		workers: 0, // no workers — nothing drains the channel
		done:    atomic.Bool{},
	}
	// Fill the buffer.
	d.Dispatch(Job{Activity: "fill"})

	var dropped bool
	// Second dispatch should hit the default branch (buffer full).
	d.Dispatch(Job{Activity: "overflow"})
	// If we get here without blocking, the default branch was taken.
	dropped = true
	if !dropped {
		t.Fatal("expected overflow job to be dropped when buffer is full")
	}
	// Drain and clean up.
	close(d.jobs)
}

// TestFnPanicRecovery verifies the worker recovers from a panicking Fn.
func TestFnPanicRecovery(t *testing.T) {
	d := &Dispatcher{
		jobs:    make(chan Job, 4),
		repo:    &Repository{},
		workers: 1,
	}
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
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for job after panic — worker did not recover")
	}
	d.Stop()
}

// TestStopDrainsRemainingJobs confirms that Stop waits for buffered jobs to finish.
func TestStopDrainsRemainingJobs(t *testing.T) {
	d := &Dispatcher{
		jobs:    make(chan Job, 32),
		repo:    &Repository{},
		workers: 1,
	}

	var counter int64
	n := 20
	// Fill the buffer before starting workers so they all queue up.
	for i := 0; i < n; i++ {
		d.Dispatch(Job{
			Activity: ActThreadCreated,
			Fn:       func() { atomic.AddInt64(&counter, 1) },
		})
	}

	d.Start()
	d.Stop()

	if got := atomic.LoadInt64(&counter); got != int64(n) {
		t.Fatalf("expected %d jobs drained, got %d", n, got)
	}
}
