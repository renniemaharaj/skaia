package jobs

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// State is the lifecycle state for a tracked background job.
type State string

const (
	StateQueued    State = "queued"
	StateRunning   State = "running"
	StateSucceeded State = "succeeded"
	StateFailed    State = "failed"
)

// Result is delivered to synchronous callers that choose to wait on a queued job.
type Result[R any] struct {
	Value R
	Err   error
}

// Snapshot is the public, immutable view of a tracked job.
type Snapshot[R any] struct {
	ID         string     `json:"id"`
	Kind       string     `json:"kind"`
	OwnerID    int64      `json:"owner_id,omitempty"`
	State      State      `json:"state"`
	Result     *R         `json:"result,omitempty"`
	Error      string     `json:"error,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	StartedAt  *time.Time `json:"started_at,omitempty"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
}

type workItem[P any, R any] struct {
	id       string
	payload  P
	resultCh chan Result[R]
}

type trackedJob[R any] struct {
	snapshot  Snapshot[R]
	expiresAt time.Time
}

// Handler performs the work for a job payload.
type Handler[P any, R any] func(context.Context, P) (R, error)

// Manager is a bounded, worker-backed, in-memory job manager for expensive
// process-local work. It is safe for concurrent use by HTTP handlers and workers.
type Manager[P any, R any] struct {
	kind    string
	handler Handler[P, R]
	jobs    chan workItem[P, R]
	workers int
	ttl     time.Duration

	mu      sync.RWMutex
	tracked map[string]*trackedJob[R]
	queueMu sync.RWMutex

	wg      sync.WaitGroup
	done    atomic.Bool
	started atomic.Bool
}

// Config controls Manager sizing and retention.
type Config struct {
	Kind    string
	Workers int
	Buffer  int
	TTL     time.Duration
}

// EnvIntDefault reads a positive integer from the environment.
func EnvIntDefault(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

// NewManager creates a job manager. Start must be called before dispatching work.
func NewManager[P any, R any](cfg Config, handler Handler[P, R]) *Manager[P, R] {
	if cfg.Workers <= 0 {
		cfg.Workers = 1
	}
	if cfg.Buffer <= 0 {
		cfg.Buffer = 1
	}
	if cfg.TTL <= 0 {
		cfg.TTL = 10 * time.Minute
	}
	if cfg.Kind == "" {
		cfg.Kind = "job"
	}
	return &Manager[P, R]{
		kind:    cfg.Kind,
		handler: handler,
		jobs:    make(chan workItem[P, R], cfg.Buffer),
		workers: cfg.Workers,
		ttl:     cfg.TTL,
		tracked: make(map[string]*trackedJob[R]),
	}
}

// Start launches worker goroutines once.
func (m *Manager[P, R]) Start() {
	if !m.started.CompareAndSwap(false, true) {
		return
	}
	for i := 0; i < m.workers; i++ {
		m.wg.Add(1)
		go m.worker(i)
	}
	log.Printf("jobs: %s manager started workers=%d buffer=%d", m.kind, m.workers, cap(m.jobs))
}

// Stop closes the queue and waits for in-flight jobs to finish.
func (m *Manager[P, R]) Stop() {
	if !m.done.CompareAndSwap(false, true) {
		return
	}
	m.queueMu.Lock()
	close(m.jobs)
	m.queueMu.Unlock()
	m.wg.Wait()
	log.Printf("jobs: %s manager stopped", m.kind)
}

// Dispatch enqueues a job without waiting for its result.
func (m *Manager[P, R]) Dispatch(ownerID int64, payload P) (Snapshot[R], bool) {
	return m.dispatch(ownerID, payload, nil)
}

// DispatchWithResult enqueues a job and returns a channel for callers that want
// to wait while still routing the work through the managed worker pool.
func (m *Manager[P, R]) DispatchWithResult(ownerID int64, payload P) (Snapshot[R], <-chan Result[R], bool) {
	ch := make(chan Result[R], 1)
	snap, ok := m.dispatch(ownerID, payload, ch)
	if !ok {
		close(ch)
	}
	return snap, ch, ok
}

func (m *Manager[P, R]) dispatch(ownerID int64, payload P, resultCh chan Result[R]) (Snapshot[R], bool) {
	var zero Snapshot[R]
	if m.done.Load() {
		return zero, false
	}

	now := time.Now().UTC()
	id := uuid.NewString()
	snap := Snapshot[R]{
		ID:        id,
		Kind:      m.kind,
		OwnerID:   ownerID,
		State:     StateQueued,
		CreatedAt: now,
	}

	m.mu.Lock()
	m.tracked[id] = &trackedJob[R]{snapshot: snap, expiresAt: now.Add(m.ttl)}
	m.cleanupLocked(now)
	m.mu.Unlock()

	m.queueMu.RLock()
	defer m.queueMu.RUnlock()
	if m.done.Load() {
		m.mu.Lock()
		delete(m.tracked, id)
		m.mu.Unlock()
		return zero, false
	}
	select {
	case m.jobs <- workItem[P, R]{id: id, payload: payload, resultCh: resultCh}:
		return snap, true
	default:
		m.mu.Lock()
		delete(m.tracked, id)
		m.mu.Unlock()
		log.Printf("jobs: %s buffer full, dropping job %s", m.kind, id)
		return zero, false
	}
}

// Get returns the tracked job snapshot if it still exists.
func (m *Manager[P, R]) Get(id string) (Snapshot[R], bool) {
	now := time.Now().UTC()
	m.mu.Lock()
	m.cleanupLocked(now)
	j, ok := m.tracked[id]
	if !ok {
		m.mu.Unlock()
		var zero Snapshot[R]
		return zero, false
	}
	snap := cloneSnapshot(j.snapshot)
	m.mu.Unlock()
	return snap, true
}

func (m *Manager[P, R]) worker(id int) {
	defer m.wg.Done()
	for item := range m.jobs {
		m.process(item)
	}
}

func (m *Manager[P, R]) process(item workItem[P, R]) {
	started := time.Now().UTC()
	m.update(item.id, func(s *Snapshot[R]) {
		s.State = StateRunning
		s.StartedAt = &started
	})

	var result R
	var err error
	func() {
		defer func() {
			if r := recover(); r != nil {
				err = fmt.Errorf("panic: %v", r)
			}
		}()
		result, err = m.handler(context.Background(), item.payload)
	}()

	finished := time.Now().UTC()
	m.update(item.id, func(s *Snapshot[R]) {
		s.FinishedAt = &finished
		if err != nil {
			s.State = StateFailed
			s.Error = err.Error()
			return
		}
		s.State = StateSucceeded
		s.Result = &result
	})

	if item.resultCh != nil {
		item.resultCh <- Result[R]{Value: result, Err: err}
		close(item.resultCh)
	}
}

func (m *Manager[P, R]) update(id string, fn func(*Snapshot[R])) {
	m.mu.Lock()
	defer m.mu.Unlock()
	j, ok := m.tracked[id]
	if !ok {
		return
	}
	fn(&j.snapshot)
	j.expiresAt = time.Now().UTC().Add(m.ttl)
}

func (m *Manager[P, R]) cleanupLocked(now time.Time) {
	for id, j := range m.tracked {
		finished := j.snapshot.State == StateSucceeded || j.snapshot.State == StateFailed
		if finished && !j.expiresAt.After(now) {
			delete(m.tracked, id)
		}
	}
}

func cloneSnapshot[R any](s Snapshot[R]) Snapshot[R] {
	if s.Result != nil {
		v := *s.Result
		s.Result = &v
	}
	if s.StartedAt != nil {
		v := *s.StartedAt
		s.StartedAt = &v
	}
	if s.FinishedAt != nil {
		v := *s.FinishedAt
		s.FinishedAt = &v
	}
	return s
}
