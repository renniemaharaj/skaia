package app

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestIntegrityManifestDetectsChangedArchive(t *testing.T) {
	path := filepath.Join(t.TempDir(), "backup.sql")
	if err := os.WriteFile(path, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeIntegrityManifest(path, "migration-safety", 7*24*time.Hour); err != nil {
		t.Fatal(err)
	}
	manifest, err := verifyIntegrityManifest(path)
	if err != nil {
		t.Fatal(err)
	}
	if manifest.BackupClass != "migration-safety" || !manifest.EncryptionRequiredAtRest {
		t.Fatalf("unexpected manifest: %+v", manifest)
	}
	if err := os.WriteFile(path, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := verifyIntegrityManifest(path); err == nil {
		t.Fatal("changed archive passed integrity verification")
	}
}

func TestInspectSQLDumpRejectsArbitraryFiles(t *testing.T) {
	dir := t.TempDir()
	valid := filepath.Join(dir, "valid.sql")
	if err := os.WriteFile(valid, []byte("-- PostgreSQL database dump\nSET statement_timeout = 0;\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := inspectSQLDump(valid); err != nil {
		t.Fatalf("valid dump rejected: %v", err)
	}
	invalid := filepath.Join(dir, "invalid.sql")
	if err := os.WriteFile(invalid, []byte("not a database dump"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := inspectSQLDump(invalid); err == nil {
		t.Fatal("arbitrary file accepted as SQL dump")
	}
}

func TestInspectArchiveValidatesStructureAndSafeNames(t *testing.T) {
	valid := filepath.Join(t.TempDir(), "valid.tar.gz")
	writeVerificationArchive(t, valid, map[string][]byte{
		"meta.json":   mustJSON(t, archiveMeta{Version: 2, Type: "client"}),
		"env":         []byte("PORT=1080\n"),
		"compose.yml": []byte("services: {}\n"),
		"db.sql":      []byte("-- PostgreSQL database dump\n"),
	})
	names, err := inspectArchive(valid)
	if err != nil || len(names) != 4 {
		t.Fatalf("valid archive rejected: names=%v err=%v", names, err)
	}

	unsafe := filepath.Join(t.TempDir(), "unsafe.tar.gz")
	writeVerificationArchive(t, unsafe, map[string][]byte{"../env": []byte("secret")})
	if _, err := inspectArchive(unsafe); err == nil {
		t.Fatal("unsafe archive path accepted")
	}
}

func writeVerificationArchive(t *testing.T, archivePath string, entries map[string][]byte) {
	t.Helper()
	f, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	compressed := gzip.NewWriter(f)
	writer := tar.NewWriter(compressed)
	for name, data := range entries {
		if err := writer.WriteHeader(&tar.Header{Name: name, Mode: 0600, Size: int64(len(data))}); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestLoadSampleIsCappedByCallerAndFailsClosed(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader("ok"))}, nil
	})}
	report := runLoadSampleWithClient(context.Background(), "http://localhost/ready", 12, 3, 500, client)
	if report["decision"] != "proceed" || report["requests"] != 12 || report["concurrency"] != 3 {
		t.Fatalf("unexpected report: %+v", report)
	}

	failing := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusServiceUnavailable, Body: io.NopCloser(strings.NewReader("unavailable"))}, nil
	})}
	report = runLoadSampleWithClient(context.Background(), "http://localhost/ready", 2, 1, 500, failing)
	if report["decision"] != "stop" {
		t.Fatalf("failed requests did not stop: %+v", report)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestLoopbackLoadBoundary(t *testing.T) {
	for _, host := range []string{"localhost", "127.0.0.1", "::1"} {
		if !isLoopbackHost(host) {
			t.Fatalf("loopback host %q denied", host)
		}
	}
	if isLoopbackHost("production.example") {
		t.Fatal("remote host allowed by default")
	}
}

func TestWebSocketOriginUsesSameOriginHTTPProtocol(t *testing.T) {
	if got := webSocketOrigin("ws://localhost:1080/ws"); got != "http://localhost:1080" {
		t.Fatalf("unexpected ws origin: %q", got)
	}
	if got := webSocketOrigin("wss://status.example/ws"); got != "https://status.example" {
		t.Fatalf("unexpected wss origin: %q", got)
	}
}
