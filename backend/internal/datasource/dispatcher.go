package datasource

import (
	"context"
	"encoding/json"
	"time"
	"strconv"
	"sync"
	"os"

	"github.com/google/uuid"
	"github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/workers"
	"github.com/renniemaharaj/conveyor/pkg/conveyor"
)

const (
	compilerWorkersEnv = "COMPILER_WORKERS"
	compilerBufferEnv  = "COMPILER_BUFFER"
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

func compilerEnvIntDefault(key string, def int) int {
	return envIntDefault(key, def)
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

type CompileDispatcher struct {
	manager *conveyor.Manager
	cache   *CompileCache
	events  *events.Dispatcher
}

func NewCompileDispatcher(cache *CompileCache, eventsDispatcher *events.Dispatcher) *CompileDispatcher {
	workersCount := compilerEnvIntDefault(compilerWorkersEnv, workers.Budget(workers.DomainDSCompile))
	m := conveyor.CreateManager().SetMinWorkers(1).SetMaxWorkers(workersCount).SetSafeQueueLength(10)
	d := &CompileDispatcher{
		manager: m,
		cache:   cache,
		events:  eventsDispatcher,
	}
	return d
}

func (d *CompileDispatcher) Start() {
	d.manager.Start()
}

func (d *CompileDispatcher) Stop() {
	d.manager.Stop()
}

func (d *CompileDispatcher) Dispatch(job CompileJob) (<-chan Result[CompileResult], bool) {
	ch := make(chan Result[CompileResult], 1)
	
	d.manager.B.Push(conveyor.CreateJob(
		context.Background(),
		job,
		func(param any) error {
			j := param.(CompileJob)
			res, err := d.processJob(context.Background(), j)
			ch <- Result[CompileResult]{Value: res, Err: err}
			return err
		},
		nil,
		nil,
	))
	return ch, true
}

func (d *CompileDispatcher) processJob(ctx context.Context, job CompileJob) (CompileResult, error) {
	files := job.Files
	if len(files) == 0 && job.Source != "" {
		files = map[string]string{"main.ts": job.Source}
	}
	res, err := CompileTypeScript(files)
	if err == nil && d.cache != nil {
		d.cache.Set(compileSourceKey(job.Source, files), res)
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
	CacheTTL     int
	UseCache     bool
	UserID       int64
	IP           string
}

type ExecuteDispatcher struct {
	manager *conveyor.Manager
	cache   *ExecuteCache
	events  *events.Dispatcher

	mu    sync.RWMutex
	snaps map[string]*Snapshot[CachedExecuteResult]
}

func NewExecuteDispatcher(cache *ExecuteCache, eventsDispatcher *events.Dispatcher) *ExecuteDispatcher {
	workersCount := envIntDefault("DATASOURCE_EXECUTE_WORKERS", workers.Budget(workers.DomainDSExecute))
	m := conveyor.CreateManager().SetMinWorkers(1).SetMaxWorkers(workersCount).SetSafeQueueLength(10)
	
	d := &ExecuteDispatcher{
		manager: m,
		cache:   cache,
		events:  eventsDispatcher,
		snaps:   make(map[string]*Snapshot[CachedExecuteResult]),
	}
	return d
}

func (d *ExecuteDispatcher) Start() {
	d.manager.Start()
}

func (d *ExecuteDispatcher) Stop() {
	d.manager.Stop()
}

func (d *ExecuteDispatcher) Dispatch(job ExecuteJob) (Snapshot[CachedExecuteResult], bool) {
	snap, _, ok := d.DispatchWithResult(job)
	return snap, ok
}

func (d *ExecuteDispatcher) DispatchWithResult(job ExecuteJob) (Snapshot[CachedExecuteResult], <-chan Result[CachedExecuteResult], bool) {
	ch := make(chan Result[CachedExecuteResult], 1)
	id := uuid.NewString()

	snap := Snapshot[CachedExecuteResult]{
		ID:        id,
		Kind:      "datasource.execute",
		OwnerID:   job.UserID,
		State:     "queued",
		CreatedAt: time.Now().UTC(),
	}

	d.mu.Lock()
	d.snaps[id] = &snap
	d.mu.Unlock()

	d.manager.B.Push(conveyor.CreateJob(
		context.Background(),
		job,
		func(param any) error {
			d.mu.Lock()
			d.snaps[id].State = "running"
			d.mu.Unlock()

			j := param.(ExecuteJob)
			res, err := d.processJob(context.Background(), j)

			d.mu.Lock()
			if err != nil {
				d.snaps[id].State = "failed"
				d.snaps[id].Error = err.Error()
			} else {
				d.snaps[id].State = "succeeded"
				d.snaps[id].Result = &res
			}
			d.mu.Unlock()

			ch <- Result[CachedExecuteResult]{Value: res, Err: err}
			return err
		},
		nil,
		nil,
	))

	return snap, ch, true
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
	result, err := ExecuteTypeScript(job.Files, job.Env)
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
