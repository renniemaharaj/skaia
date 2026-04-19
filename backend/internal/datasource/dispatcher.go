package datasource

import (
	"log"
	"os"
	"strconv"
	"sync"
	"sync/atomic"

	"github.com/skaia/backend/internal/events"
)

const (
	compilerWorkersEnv = "COMPILER_WORKERS"
	compilerBufferEnv  = "COMPILER_BUFFER"
)

func compilerEnvIntDefault(key string, def int) int {
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

// CompileJob is a compile request on the conveyor.
type CompileJob struct {
	DataSourceID int64
	Source       string
	Files        map[string]string
	UserID       int64
	IP           string
	ResultCh     chan compileResult
}

type compileResult struct {
	Result *CompileResult
	Err    error
}

// CompileDispatcher manages a separate compiler conveyor belt.
type CompileDispatcher struct {
	jobs    chan CompileJob
	cache   *CompileCache
	events  *events.Dispatcher
	workers int
	wg      sync.WaitGroup
	done    atomic.Bool
}

// NewCompileDispatcher creates a dispatcher for compiler jobs.
func NewCompileDispatcher(cache *CompileCache, eventsDispatcher *events.Dispatcher) *CompileDispatcher {
	workers := compilerEnvIntDefault(compilerWorkersEnv, 2)
	bufSize := compilerEnvIntDefault(compilerBufferEnv, 64)
	return &CompileDispatcher{
		jobs:    make(chan CompileJob, bufSize),
		cache:   cache,
		events:  eventsDispatcher,
		workers: workers,
	}
}

// Start launches compiler workers.
func (d *CompileDispatcher) Start() {
	for i := 0; i < d.workers; i++ {
		d.wg.Add(1)
		go d.worker(i)
	}
	log.Printf("datasource: compile dispatcher started — workers=%d buffer=%d", d.workers, cap(d.jobs))
}

// Stop closes the compiler conveyor and waits for workers.
func (d *CompileDispatcher) Stop() {
	d.done.Store(true)
	close(d.jobs)
	d.wg.Wait()
	log.Println("datasource: compile dispatcher stopped")
}

// Dispatch enqueues a compile job. Returns false if the buffer is full.
func (d *CompileDispatcher) Dispatch(job CompileJob) bool {
	if d.done.Load() {
		return false
	}
	select {
	case d.jobs <- job:
		return true
	default:
		log.Printf("datasource: compile buffer full, dropping request for datasource %d", job.DataSourceID)
		return false
	}
}

func (d *CompileDispatcher) worker(id int) {
	defer d.wg.Done()
	for job := range d.jobs {
		d.processJob(job)
	}
}

func (d *CompileDispatcher) processJob(job CompileJob) {
	files := job.Files
	if len(files) == 0 && job.Source != "" {
		files = map[string]string{"main.ts": job.Source}
	}
	res, err := CompileTypeScript(files)
	if err == nil && d.cache != nil {
		d.cache.Set(job.Source, res)
	}
	if job.ResultCh != nil {
		job.ResultCh <- compileResult{Result: res, Err: err}
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
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
