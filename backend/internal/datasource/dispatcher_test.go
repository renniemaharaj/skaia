package datasource

import (
	"encoding/json"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestDatasourceDispatchersShareRuntimeWorkers(t *testing.T) {
	runtime := NewRuntimeWorkers()
	compileDispatcher := NewCompileDispatcher(runtime, nil, nil)
	executeDispatcher := NewExecuteDispatcher(runtime, nil, nil)

	if compileDispatcher.runtime != executeDispatcher.runtime {
		t.Fatal("compile and execute dispatchers do not share runtime workers")
	}
	if compileDispatcher.runtime.manager != executeDispatcher.runtime.manager {
		t.Fatal("compile and execute dispatchers do not share one conveyor manager")
	}
}

func TestCompileSourceKeyUsesFiles(t *testing.T) {
	filesA := map[string]string{"main.ts": "export default 1", "lib.ts": "export const x = 1"}
	filesB := map[string]string{"main.ts": "export default 1", "lib.ts": "export const x = 2"}

	keyA := compileSourceKey("", filesA)
	keyB := compileSourceKey("", filesB)
	if keyA == "" {
		t.Fatal("expected non-empty key for files")
	}
	if keyA == keyB {
		t.Fatal("expected different file contents to produce different cache keys")
	}
}

func TestCompileSourceKeyFallsBackToLegacySource(t *testing.T) {
	if got := compileSourceKey("legacy", nil); got != "legacy" {
		t.Fatalf("key = %q, want legacy source", got)
	}
}

func TestCompileDispatcherCoalescesIdenticalDatasourceWork(t *testing.T) {
	runtime := NewRuntimeWorkers()
	runtime.Start()
	defer runtime.Stop()

	dispatcher := NewCompileDispatcher(runtime, nil, nil)
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	dispatcher.compile = func(map[string]string) (*CompileResult, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return &CompileResult{JS: "compiled"}, nil
	}

	job := CompileJob{DataSourceID: 42, Files: map[string]string{"main.ts": "return [];"}}
	first, _ := dispatcher.Dispatch(job)
	waitSignal(t, started, "compile worker start")
	second, _ := dispatcher.Dispatch(job)
	close(release)

	if result := waitResult(t, first, "first compile"); result.Err != nil || result.Value.JS != "compiled" {
		t.Fatalf("unexpected first result: %#v", result)
	}
	if result := waitResult(t, second, "second compile"); result.Err != nil || result.Value.JS != "compiled" {
		t.Fatalf("unexpected second result: %#v", result)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("compile calls = %d, want 1", got)
	}
}

func TestExecuteDispatcherCoalescesIdenticalDatasourceWork(t *testing.T) {
	runtime := NewRuntimeWorkers()
	runtime.Start()
	defer runtime.Stop()

	dispatcher := NewExecuteDispatcher(runtime, nil, nil)
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	dispatcher.execute = func(map[string]string, map[string]string, bool) (*ExecuteResult, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return &ExecuteResult{Data: json.RawMessage(`[{"status":"ok"}]`)}, nil
	}

	job := ExecuteJob{DataSourceID: 42, Files: map[string]string{"main.ts": "return [];"}, UseCache: true, CacheTTL: 60}
	firstSnapshot, first, _ := dispatcher.DispatchWithResult(job)
	waitSignal(t, started, "execute worker start")
	secondSnapshot, second, _ := dispatcher.DispatchWithResult(job)
	close(release)

	if firstSnapshot.ID != secondSnapshot.ID {
		t.Fatalf("coalesced executions returned different jobs: %q != %q", firstSnapshot.ID, secondSnapshot.ID)
	}
	if result := waitResult(t, first, "first execute"); result.Err != nil {
		t.Fatalf("unexpected first execution error: %v", result.Err)
	}
	if result := waitResult(t, second, "second execute"); result.Err != nil {
		t.Fatalf("unexpected second execution error: %v", result.Err)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("execute calls = %d, want 1", got)
	}
}

func TestExecuteDispatcherRechecksCacheInsideWinningWorker(t *testing.T) {
	runtime := NewRuntimeWorkers()
	runtime.Start()
	defer runtime.Stop()

	cached := &CachedExecuteResult{
		ExecuteResult: ExecuteResult{Data: json.RawMessage(`[{"cached":true}]`)},
		CachedAt:      time.Now().UTC(),
		CacheTTL:      60,
	}
	cache := &executeCacheStub{result: cached}
	dispatcher := NewExecuteDispatcher(runtime, cache, nil)
	var calls atomic.Int32
	dispatcher.execute = func(map[string]string, map[string]string, bool) (*ExecuteResult, error) {
		calls.Add(1)
		return &ExecuteResult{}, nil
	}

	_, resultCh, _ := dispatcher.DispatchWithResult(ExecuteJob{DataSourceID: 7, UseCache: true, CacheTTL: 60})
	result := waitResult(t, resultCh, "cached execute")
	if result.Err != nil || string(result.Value.Data) != `[{"cached":true}]` {
		t.Fatalf("unexpected cached result: %#v", result)
	}
	if got := calls.Load(); got != 0 {
		t.Fatalf("execute calls = %d, want 0 after cache recheck", got)
	}
	if cache.getCalls() != 1 {
		t.Fatalf("cache gets = %d, want 1", cache.getCalls())
	}
}

func TestCompileDispatcherRechecksCacheInsideWinningWorker(t *testing.T) {
	runtime := NewRuntimeWorkers()
	runtime.Start()
	defer runtime.Stop()

	cache := &compileCacheStub{result: &CompileResult{JS: "cached", Cached: true}}
	dispatcher := NewCompileDispatcher(runtime, cache, nil)
	var calls atomic.Int32
	dispatcher.compile = func(map[string]string) (*CompileResult, error) {
		calls.Add(1)
		return &CompileResult{JS: "unexpected"}, nil
	}

	resultCh, _ := dispatcher.Dispatch(CompileJob{DataSourceID: 7, Files: map[string]string{"main.ts": "return [];"}})
	result := waitResult(t, resultCh, "cached compile")
	if result.Err != nil || result.Value.JS != "cached" || !result.Value.Cached {
		t.Fatalf("unexpected cached result: %#v", result)
	}
	if got := calls.Load(); got != 0 {
		t.Fatalf("compile calls = %d, want 0 after cache recheck", got)
	}
}

func TestPreviewFlightKeySeparatesDifferentInputs(t *testing.T) {
	first := ExecuteJob{Files: map[string]string{"main.ts": "return [1];"}, Env: map[string]string{"TOKEN": "one"}, Preview: true}
	second := ExecuteJob{Files: map[string]string{"main.ts": "return [2];"}, Env: map[string]string{"TOKEN": "two"}, Preview: true}
	if executeFlightKey(first) == executeFlightKey(second) {
		t.Fatal("different transient preview inputs share a flight key")
	}
}

func TestExecuteDispatcherReleasesWaitersWhenWorkerPanics(t *testing.T) {
	runtime := NewRuntimeWorkers()
	runtime.Start()
	defer runtime.Stop()

	dispatcher := NewExecuteDispatcher(runtime, nil, nil)
	started := make(chan struct{})
	release := make(chan struct{})
	dispatcher.execute = func(map[string]string, map[string]string, bool) (*ExecuteResult, error) {
		close(started)
		<-release
		panic("test panic")
	}

	job := ExecuteJob{DataSourceID: 19, UseCache: true, CacheTTL: 60}
	_, first, _ := dispatcher.DispatchWithResult(job)
	waitSignal(t, started, "panicking execute worker start")
	_, second, _ := dispatcher.DispatchWithResult(job)
	close(release)

	for index, resultCh := range []<-chan Result[CachedExecuteResult]{first, second} {
		result := waitResult(t, resultCh, "panicking execute waiter")
		if result.Err == nil || !strings.Contains(result.Err.Error(), "test panic") {
			t.Fatalf("waiter %d did not receive the recovered panic: %v", index, result.Err)
		}
	}
	if len(dispatcher.flights) != 0 {
		t.Fatalf("completed panic left %d execute flights behind", len(dispatcher.flights))
	}
}

type executeCacheStub struct {
	mu     sync.Mutex
	result *CachedExecuteResult
	get    int
	set    int
}

type compileCacheStub struct {
	result *CompileResult
}

func (c *compileCacheStub) Get(string) (*CompileResult, bool) {
	return c.result, c.result != nil
}

func (c *compileCacheStub) Set(string, *CompileResult) {}

func (c *executeCacheStub) Get(int64) (*CachedExecuteResult, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.get++
	return c.result, c.result != nil
}

func (c *executeCacheStub) Set(int64, *ExecuteResult, time.Duration) {
	c.mu.Lock()
	c.set++
	c.mu.Unlock()
}

func (c *executeCacheStub) getCalls() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.get
}

func waitSignal(t *testing.T, signal <-chan struct{}, label string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
	}
}

func waitResult[R any](t *testing.T, result <-chan Result[R], label string) Result[R] {
	t.Helper()
	select {
	case value := <-result:
		return value
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", label)
		var zero Result[R]
		return zero
	}
}
