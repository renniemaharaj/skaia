// Package integration provides a lightweight HTTP integration test suite that
// can be driven from main() without the testing binary runtime.
package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
)

// ── T: lightweight testing.T stand-in ────────────────────────────────────────

// testAbort is used as a sentinel panic value so Fatalf can stop a test early.
type testAbort struct{}

// T is a minimal test context usable outside the testing binary.
type T struct {
	Name   string
	failed bool
	logs   []string
}

func (t *T) Logf(format string, args ...any) {
	t.logs = append(t.logs, fmt.Sprintf(format, args...))
}

func (t *T) Errorf(format string, args ...any) {
	t.failed = true
	t.logs = append(t.logs, "FAIL: "+fmt.Sprintf(format, args...))
}

// Fatalf marks the test as failed and aborts execution of the current test
// function immediately (all deferred calls still run).
func (t *T) Fatalf(format string, args ...any) {
	t.Errorf(format, args...)
	panic(testAbort{})
}

// RequireNoError fails the test immediately if err != nil.
func (t *T) RequireNoError(err error) {
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// Require fails immediately if condition is false.
func (t *T) Require(condition bool, format string, args ...any) {
	if !condition {
		t.Fatalf(format, args...)
	}
}

// RequireStatus fails immediately if resp.StatusCode != want.
// The response body is buffered so it can still be read afterwards.
func (t *T) RequireStatus(resp *http.Response, want int) {
	if resp.StatusCode != want {
		body, _ := io.ReadAll(resp.Body)
		resp.Body = io.NopCloser(bytes.NewReader(body))
		t.Fatalf("expected HTTP %d, got %d: %s", want, resp.StatusCode, strings.TrimSpace(string(body)))
	}
}

// AssertEqual marks the test as failed (but does not abort) if a != b.
func (t *T) AssertEqual(a, b any, label string) {
	if fmt.Sprintf("%v", a) != fmt.Sprintf("%v", b) {
		t.Errorf("%s: expected %v, got %v", label, b, a)
	}
}

// ── Suite ─────────────────────────────────────────────────────────────────────

type testCase struct {
	name string
	fn   func(*T)
}

// Suite manages a list of test cases and a shared httptest.Server.
type Suite struct {
	server *httptest.Server
	client *http.Client
	tests  []testCase
}

// NewSuite creates a Suite backed by a real httptest.Server wrapping handler.
func NewSuite(handler http.Handler) *Suite {
	srv := httptest.NewServer(handler)
	return &Suite{
		server: srv,
		client: &http.Client{
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// Add registers a named test case.
func (s *Suite) Add(name string, fn func(*T)) {
	s.tests = append(s.tests, testCase{name: name, fn: fn})
}

// Run executes every registered test sequentially.
// Returns counts of passed and failed tests.
func (s *Suite) Run() (passed, failed int) {
	defer s.server.Close()

	for _, tc := range s.tests {
		t := &T{Name: tc.name}

		func() {
			defer func() {
				if r := recover(); r != nil {
					if _, ok := r.(testAbort); !ok {
						t.Errorf("panic: %v", r)
					}
				}
			}()
			tc.fn(t)
		}()

		if t.failed {
			failed++
			log.Printf("FAIL  %s", tc.name)
			for _, l := range t.logs {
				log.Printf("      %s", l)
			}
		} else {
			passed++
			log.Printf("ok    %s", tc.name)
		}
	}
	return
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

// URL returns the full URL for the given path on the test server.
func (s *Suite) URL(path string) string { return s.server.URL + path }

func (s *Suite) do(method, path string, body any, headers map[string]string) *http.Response {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, s.URL(path), r)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		panic(fmt.Sprintf("http %s %s: %v", method, path, err))
	}
	return resp
}

func (s *Suite) GET(path string, headers map[string]string) *http.Response {
	return s.do(http.MethodGet, path, nil, headers)
}

func (s *Suite) POST(path string, body any, headers map[string]string) *http.Response {
	return s.do(http.MethodPost, path, body, headers)
}

func (s *Suite) PUT(path string, body any, headers map[string]string) *http.Response {
	return s.do(http.MethodPut, path, body, headers)
}

// DELETE sends a DELETE request. body may be nil for the common case of
// no request body (e.g. deleting by URL param), or a value that will be
// JSON-encoded as the request body when the endpoint requires it.
func (s *Suite) DELETE(path string, body any, headers map[string]string) *http.Response {
	return s.do(http.MethodDelete, path, body, headers)
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

// ReadJSON drains and closes resp.Body, returning the decoded JSON object.
func ReadJSON(resp *http.Response) map[string]any {
	defer resp.Body.Close()
	var m map[string]any
	json.NewDecoder(resp.Body).Decode(&m) //nolint:errcheck
	return m
}

// ReadJSONList drains and closes resp.Body, returning a decoded JSON array.
func ReadJSONList(resp *http.Response) []any {
	defer resp.Body.Close()
	var a []any
	json.NewDecoder(resp.Body).Decode(&a) //nolint:errcheck
	return a
}

// Str safely casts a JSON-decoded value to string.
func Str(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// ID safely casts a JSON-decoded number to int64.
func ID(v any) int64 {
	if f, ok := v.(float64); ok {
		return int64(f)
	}
	return 0
}

// IDStr returns an id value as a decimal string suitable for URL paths.
func IDStr(v any) string {
	return fmt.Sprintf("%d", ID(v))
}

// Bearer returns a header map containing an Authorization: Bearer header.
func Bearer(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}
