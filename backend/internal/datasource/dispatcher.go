package datasource

import (
	"context"
	"encoding/json"
	"time"

	"github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/jobs"
)

const (
	compilerWorkersEnv = "COMPILER_WORKERS"
	compilerBufferEnv  = "COMPILER_BUFFER"
)

func compilerEnvIntDefault(key string, def int) int {
	return jobs.EnvIntDefault(key, def)
}

// CompileJob is a compile request on the conveyor.
type CompileJob struct {
	DataSourceID int64
	Source       string
	Files        map[string]string
	UserID       int64
	IP           string
}

// CompileDispatcher manages a separate compiler conveyor belt.
type CompileDispatcher struct {
	manager *jobs.Manager[CompileJob, CompileResult]
	cache   *CompileCache
	events  *events.Dispatcher
}

// NewCompileDispatcher creates a dispatcher for compiler jobs.
func NewCompileDispatcher(cache *CompileCache, eventsDispatcher *events.Dispatcher) *CompileDispatcher {
	workers := compilerEnvIntDefault(compilerWorkersEnv, 2)
	bufSize := compilerEnvIntDefault(compilerBufferEnv, 64)
	d := &CompileDispatcher{cache: cache, events: eventsDispatcher}
	d.manager = jobs.NewManager(jobs.Config{
		Kind:    "datasource.compile",
		Workers: workers,
		Buffer:  bufSize,
		TTL:     10 * time.Minute,
	}, d.processJob)
	return d
}

// Start launches compiler workers.
func (d *CompileDispatcher) Start() {
	d.manager.Start()
}

// Stop closes the compiler conveyor and waits for workers.
func (d *CompileDispatcher) Stop() {
	d.manager.Stop()
}

// Dispatch enqueues a compile job and returns a channel for the result.
func (d *CompileDispatcher) Dispatch(job CompileJob) (<-chan jobs.Result[CompileResult], bool) {
	_, resultCh, ok := d.manager.DispatchWithResult(job.UserID, job)
	return resultCh, ok
}

func (d *CompileDispatcher) processJob(ctx context.Context, job CompileJob) (CompileResult, error) {
	_ = ctx
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

// ExecuteDispatcher manages server-side datasource execution jobs.
type ExecuteDispatcher struct {
	manager *jobs.Manager[ExecuteJob, CachedExecuteResult]
	cache   *ExecuteCache
	events  *events.Dispatcher
}

// NewExecuteDispatcher creates a managed worker pool for expensive executions.
func NewExecuteDispatcher(cache *ExecuteCache, eventsDispatcher *events.Dispatcher) *ExecuteDispatcher {
	workers := jobs.EnvIntDefault("DATASOURCE_EXECUTE_WORKERS", 2)
	bufSize := jobs.EnvIntDefault("DATASOURCE_EXECUTE_BUFFER", 64)
	d := &ExecuteDispatcher{cache: cache, events: eventsDispatcher}
	d.manager = jobs.NewManager(jobs.Config{
		Kind:    "datasource.execute",
		Workers: workers,
		Buffer:  bufSize,
		TTL:     30 * time.Minute,
	}, d.processJob)
	return d
}

func (d *ExecuteDispatcher) Start() {
	d.manager.Start()
}

func (d *ExecuteDispatcher) Stop() {
	d.manager.Stop()
}

func (d *ExecuteDispatcher) Dispatch(job ExecuteJob) (jobs.Snapshot[CachedExecuteResult], bool) {
	return d.manager.Dispatch(job.UserID, job)
}

func (d *ExecuteDispatcher) DispatchWithResult(job ExecuteJob) (jobs.Snapshot[CachedExecuteResult], <-chan jobs.Result[CachedExecuteResult], bool) {
	return d.manager.DispatchWithResult(job.UserID, job)
}

func (d *ExecuteDispatcher) Get(id string) (jobs.Snapshot[CachedExecuteResult], bool) {
	return d.manager.Get(id)
}

func (d *ExecuteDispatcher) processJob(ctx context.Context, job ExecuteJob) (CachedExecuteResult, error) {
	_ = ctx
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
