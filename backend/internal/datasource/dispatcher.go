package datasource

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/renniemaharaj/conveyor/pkg/conveyor"
	"github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/workers"
)

func envIntDefault(key string, def int) int {
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

type Result[R any] struct {
	Value R
	Err   error
}

type Snapshot[R any] struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	OwnerID   int64     `json:"owner_id,omitempty"`
	State     string    `json:"state"`
	Result    *R        `json:"result,omitempty"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type CompileJob struct {
	DataSourceID int64
	Source       string
	Files        map[string]string
	UserID       int64
	IP           string
}

// RuntimeWorkers owns the one conveyor pool shared by every datasource compile
// and execute job. Waiters for identical work never occupy a worker.
type RuntimeWorkers struct {
	manager *conveyor.Manager
}

func NewRuntimeWorkers() *RuntimeWorkers {
	workersCount := envIntDefault("DATASOURCE_WORKERS", workers.Budget(workers.DomainDSExecute))
	queueThreshold := envIntDefault("DATASOURCE_QUEUE_THRESHOLD", 10)
	return &RuntimeWorkers{manager: conveyor.CreateManager().
		SetMinWorkers(1).
		SetMaxWorkers(workersCount).
		SetSafeQueueLength(queueThreshold)}
}

func (w *RuntimeWorkers) Start() {
	w.manager.Start()
}

func (w *RuntimeWorkers) Stop() {
	w.manager.Stop()
}

type compileCacheStore interface {
	Get(source string) (*CompileResult, bool)
	Set(source string, result *CompileResult)
}

type compileFlight struct {
	waiters []chan Result[CompileResult]
}

type CompileDispatcher struct {
	runtime *RuntimeWorkers
	cache   compileCacheStore
	events  *events.Dispatcher
	compile func(map[string]string) (*CompileResult, error)

	flightMu sync.Mutex
	flights  map[string]*compileFlight
}

func NewCompileDispatcher(runtime *RuntimeWorkers, cache compileCacheStore, eventsDispatcher *events.Dispatcher) *CompileDispatcher {
	return &CompileDispatcher{
		runtime: runtime,
		cache:   cache,
		events:  eventsDispatcher,
		compile: CompileTypeScript,
		flights: make(map[string]*compileFlight),
	}
}

func (d *CompileDispatcher) Dispatch(job CompileJob) (<-chan Result[CompileResult], bool) {
	ch := make(chan Result[CompileResult], 1)
	key := compileFlightKey(job)

	d.flightMu.Lock()
	if flight, ok := d.flights[key]; ok {
		flight.waiters = append(flight.waiters, ch)
		d.flightMu.Unlock()
		return ch, true
	}
	d.flights[key] = &compileFlight{waiters: []chan Result[CompileResult]{ch}}
	d.flightMu.Unlock()

	d.runtime.manager.B.Push(conveyor.CreateJob(
		context.Background(),
		job,
		func(param any) error {
			return d.runFlight(key, param.(CompileJob))
		},
		nil,
		nil,
	))
	return ch, true
}

func (d *CompileDispatcher) runFlight(key string, job CompileJob) (err error) {
	var result CompileResult
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("datasource compile worker panicked: %v", recovered)
		}
		d.completeFlight(key, Result[CompileResult]{Value: result, Err: err})
	}()
	result, err = d.processJob(context.Background(), job)
	return err
}

func (d *CompileDispatcher) completeFlight(key string, result Result[CompileResult]) {
	d.flightMu.Lock()
	flight := d.flights[key]
	delete(d.flights, key)
	d.flightMu.Unlock()
	if flight == nil {
		return
	}
	for _, waiter := range flight.waiters {
		waiter <- result
		close(waiter)
	}
}

func (d *CompileDispatcher) processJob(ctx context.Context, job CompileJob) (CompileResult, error) {
	files := job.Files
	if len(files) == 0 && job.Source != "" {
		files = map[string]string{"main.ts": job.Source}
	}
	cacheKey := compileSourceKey(job.Source, files)
	if d.cache != nil {
		if cached, ok := d.cache.Get(cacheKey); ok {
			return *cached, nil
		}
	}
	res, err := d.compile(files)
	if err == nil && d.cache != nil {
		d.cache.Set(cacheKey, res)
	}
	if d.events != nil {
		d.events.Dispatch(events.Job{
			UserID:     job.UserID,
			Activity:   "datasource.compiled",
			Resource:   "datasource",
			ResourceID: job.DataSourceID,
			Meta: map[string]interface{}{
				"success": err == nil,
				"error":   errorMessage(err),
			},
			IP: job.IP,
		})
	}
	if err != nil {
		return CompileResult{}, err
	}
	return *res, nil
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

type ExecuteJob struct {
	DataSourceID int64
	Files        map[string]string
	Env          map[string]string
	Preview      bool
	CacheTTL     int
	UseCache     bool
	UserID       int64
	IP           string
}

type executeCacheStore interface {
	Get(dsID int64) (*CachedExecuteResult, bool)
	Set(dsID int64, result *ExecuteResult, ttl time.Duration)
}

type executeFlight struct {
	snapshotID string
	waiters    []chan Result[CachedExecuteResult]
}

type ExecuteDispatcher struct {
	runtime *RuntimeWorkers
	cache   executeCacheStore
	events  *events.Dispatcher
	execute func(map[string]string, map[string]string, bool) (*ExecuteResult, error)

	mu       sync.RWMutex
	snaps    map[string]*Snapshot[CachedExecuteResult]
	flightMu sync.Mutex
	flights  map[string]*executeFlight
}

func NewExecuteDispatcher(runtime *RuntimeWorkers, cache executeCacheStore, eventsDispatcher *events.Dispatcher) *ExecuteDispatcher {
	return &ExecuteDispatcher{
		runtime: runtime,
		cache:   cache,
		events:  eventsDispatcher,
		execute: ExecuteTypeScript,
		snaps:   make(map[string]*Snapshot[CachedExecuteResult]),
		flights: make(map[string]*executeFlight),
	}
}

func (d *ExecuteDispatcher) Dispatch(job ExecuteJob) (Snapshot[CachedExecuteResult], bool) {
	snap, _, ok := d.DispatchWithResult(job)
	return snap, ok
}

func (d *ExecuteDispatcher) DispatchWithResult(job ExecuteJob) (Snapshot[CachedExecuteResult], <-chan Result[CachedExecuteResult], bool) {
	ch := make(chan Result[CachedExecuteResult], 1)
	key := executeFlightKey(job)

	d.flightMu.Lock()
	if flight, ok := d.flights[key]; ok {
		flight.waiters = append(flight.waiters, ch)
		d.mu.RLock()
		snap := *d.snaps[flight.snapshotID]
		d.mu.RUnlock()
		d.flightMu.Unlock()
		return snap, ch, true
	}

	id := uuid.NewString()
	snap := Snapshot[CachedExecuteResult]{
		ID:        id,
		Kind:      "datasource.execute",
		OwnerID:   job.UserID,
		State:     "queued",
		CreatedAt: time.Now().UTC(),
	}

	d.mu.Lock()
	storedSnapshot := snap
	d.snaps[id] = &storedSnapshot
	d.mu.Unlock()
	d.flights[key] = &executeFlight{
		snapshotID: id,
		waiters:    []chan Result[CachedExecuteResult]{ch},
	}
	d.flightMu.Unlock()

	d.runtime.manager.B.Push(conveyor.CreateJob(
		context.Background(),
		job,
		func(param any) error {
			return d.runFlight(key, id, param.(ExecuteJob))
		},
		nil,
		nil,
	))

	return snap, ch, true
}

func (d *ExecuteDispatcher) runFlight(key, id string, job ExecuteJob) (err error) {
	d.mu.Lock()
	d.snaps[id].State = "running"
	d.mu.Unlock()

	var result CachedExecuteResult
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("datasource execute worker panicked: %v", recovered)
		}

		d.mu.Lock()
		if err != nil {
			d.snaps[id].State = "failed"
			d.snaps[id].Error = err.Error()
		} else {
			d.snaps[id].State = "succeeded"
			d.snaps[id].Result = &result
		}
		d.mu.Unlock()

		d.completeFlight(key, Result[CachedExecuteResult]{Value: result, Err: err})
	}()

	result, err = d.processJob(context.Background(), job)
	return err
}

func (d *ExecuteDispatcher) completeFlight(key string, result Result[CachedExecuteResult]) {
	d.flightMu.Lock()
	flight := d.flights[key]
	delete(d.flights, key)
	d.flightMu.Unlock()
	if flight == nil {
		return
	}
	for _, waiter := range flight.waiters {
		waiter <- result
		close(waiter)
	}
}

func (d *ExecuteDispatcher) Get(id string) (Snapshot[CachedExecuteResult], bool) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if snap, ok := d.snaps[id]; ok {
		return *snap, true
	}
	return Snapshot[CachedExecuteResult]{}, false
}

func (d *ExecuteDispatcher) processJob(ctx context.Context, job ExecuteJob) (CachedExecuteResult, error) {
	// The handler has a fast cache path, but the winning worker must check again
	// after acquiring the flight. Another request may have filled Redis between
	// the first lookup and this job starting.
	if job.UseCache && job.CacheTTL > 0 && d.cache != nil {
		if cached, ok := d.cache.Get(job.DataSourceID); ok {
			return *cached, nil
		}
	}

	result, err := d.execute(job.Files, job.Env, job.Preview)
	if err != nil {
		d.recordExecuteEvent(job, false, err)
		return CachedExecuteResult{}, err
	}

	resp := CachedExecuteResult{
		ExecuteResult: *result,
		CachedAt:      time.Now().UTC(),
		CacheTTL:      job.CacheTTL,
	}
	if job.UseCache && job.CacheTTL > 0 && d.cache != nil && result.Error == "" {
		d.cache.Set(job.DataSourceID, result, time.Duration(job.CacheTTL)*time.Second)
	}
	d.recordExecuteEvent(job, result.Error == "", nil)
	return resp, nil
}

func compileFlightKey(job CompileJob) string {
	fingerprint := stableJobHash(struct {
		Source string
		Files  map[string]string
	}{Source: job.Source, Files: job.Files})
	if job.DataSourceID > 0 {
		return "compile:" + strconv.FormatInt(job.DataSourceID, 10) + ":" + fingerprint
	}
	return "compile:source:" + fingerprint
}

func executeFlightKey(job ExecuteJob) string {
	if job.DataSourceID > 0 && job.UseCache {
		return "execute:" + strconv.FormatInt(job.DataSourceID, 10)
	}
	prefix := "execute:preview:"
	if job.DataSourceID > 0 {
		prefix = "execute:" + strconv.FormatInt(job.DataSourceID, 10) + ":transient:"
	}
	return prefix + stableJobHash(struct {
		Files   map[string]string
		Env     map[string]string
		Preview bool
	}{Files: job.Files, Env: job.Env, Preview: job.Preview})
}

func stableJobHash(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("marshal-error:%T", value)
	}
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

func (d *ExecuteDispatcher) recordExecuteEvent(job ExecuteJob, success bool, err error) {
	if d.events == nil {
		return
	}
	d.events.Dispatch(events.Job{
		UserID:     job.UserID,
		Activity:   "datasource.executed",
		Resource:   "datasource",
		ResourceID: job.DataSourceID,
		Meta: map[string]interface{}{
			"success": success,
			"error":   errorMessage(err),
		},
		IP: job.IP,
	})
}

func compileSourceKey(source string, files map[string]string) string {
	if len(files) == 0 {
		return source
	}
	b, err := json.Marshal(files)
	if err != nil {
		return source
	}
	return string(b)
}
