package app

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

type verificationCheck struct {
	Name      string `json:"name"`
	Passed    bool   `json:"passed"`
	Required  bool   `json:"required"`
	Code      string `json:"code"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
}

type releaseVerification struct {
	Tenant           string              `json:"tenant"`
	Revision         string              `json:"revision"`
	ConfigKeysSHA256 string              `json:"config_keys_sha256"`
	LatestMigration  string              `json:"latest_migration"`
	CheckedAt        string              `json:"checked_at"`
	Checks           []verificationCheck `json:"checks"`
	Decision         string              `json:"decision"`
}

func cmdVerify(args []string) {
	if len(args) < 2 {
		die("Usage: grengo verify <backup|release> <target>")
	}
	switch args[0] {
	case "backup":
		manifest, err := verifyIntegrityManifest(args[1])
		if err != nil {
			writeStopDecision("manifest_verification_failed")
			die("Backup verification failed")
		}
		result := map[string]any{"decision": "proceed", "manifest": manifest}
		if strings.HasSuffix(strings.ToLower(args[1]), ".tar.gz") || strings.HasSuffix(strings.ToLower(args[1]), ".tgz") {
			files, err := inspectArchive(args[1])
			if err != nil {
				writeStopDecision("archive_structure_invalid")
				die("Backup structure verification failed")
			}
			result["entries"] = files
		} else if err := inspectSQLDump(args[1]); err != nil {
			writeStopDecision("sql_structure_invalid")
			die("SQL backup structure verification failed")
		}
		_ = json.NewEncoder(os.Stdout).Encode(result)
	case "release":
		name := args[1]
		origin := flagValue(args[2:], "--url")
		if origin == "" {
			origin = envVal(clientEnvFile(name), "PUBLIC_BASE_URL")
		}
		report := runReleaseVerification(context.Background(), name, origin, &http.Client{Timeout: 4 * time.Second})
		_ = json.NewEncoder(os.Stdout).Encode(report)
		if report.Decision != "proceed" {
			die("Release verification stopped")
		}
	default:
		die("Unknown verify target: %s", args[0])
	}
}

func inspectSQLDump(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	prefix, err := io.ReadAll(io.LimitReader(f, 64<<10))
	if err != nil {
		return err
	}
	text := string(prefix)
	if !strings.Contains(text, "PostgreSQL database dump") || (!strings.Contains(text, "CREATE") && !strings.Contains(text, "SET ")) {
		return fmt.Errorf("unrecognized PostgreSQL dump")
	}
	return nil
}

func inspectArchive(archivePath string) ([]string, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	compressed, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	defer compressed.Close()

	reader := tar.NewReader(compressed)
	names := make([]string, 0, 32)
	required := map[string]bool{}
	var meta archiveMeta
	metaFound := false
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if header.Typeflag != tar.TypeReg {
			continue
		}
		cleanName := path.Clean(header.Name)
		if cleanName == "." || cleanName != header.Name || path.IsAbs(cleanName) || strings.HasPrefix(cleanName, "../") {
			return nil, fmt.Errorf("unsafe archive entry")
		}
		if len(names) >= 100000 {
			return nil, fmt.Errorf("archive entry count exceeds verification bound")
		}
		names = append(names, cleanName)
		required[cleanName] = true
		if cleanName == "meta.json" {
			if header.Size < 0 || header.Size > 64<<10 {
				return nil, fmt.Errorf("invalid archive metadata size")
			}
			metaData, err := io.ReadAll(io.LimitReader(reader, header.Size+1))
			if err != nil || int64(len(metaData)) != header.Size {
				return nil, fmt.Errorf("invalid archive metadata")
			}
			if err := json.Unmarshal(metaData, &meta); err != nil {
				return nil, fmt.Errorf("invalid archive metadata")
			}
			metaFound = true
		}
	}
	if !metaFound {
		return nil, fmt.Errorf("meta.json missing")
	}
	if meta.Version < 1 || (meta.Type != "client" && meta.Type != "node") {
		return nil, fmt.Errorf("invalid archive metadata")
	}
	if meta.Type == "client" {
		for _, entry := range []string{"env", "compose.yml", "db.sql"} {
			if !required[entry] {
				return nil, fmt.Errorf("required entry %s missing", entry)
			}
		}
	}
	sort.Strings(names)
	return names, nil
}

func writeStopDecision(code string) {
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"decision": "stop", "code": code})
}

func runReleaseVerification(ctx context.Context, name, origin string, client *http.Client) releaseVerification {
	report := releaseVerification{Tenant: name, CheckedAt: time.Now().UTC().Format(time.RFC3339), Decision: "stop"}
	if revision, err := exec.Command("git", "rev-parse", "HEAD").Output(); err == nil {
		report.Revision = strings.TrimSpace(string(revision))
	}
	envPath := clientEnvFile(name)
	values := map[string]string{}
	if data, err := os.ReadFile(envPath); err == nil {
		values = parseEnvBytes(data)
		report.ConfigKeysSHA256 = hashConfigKeys(values)
	}
	entries, _ := os.ReadDir(filepath.Join(backendSrc(), "internal", "migrations"))
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".sql" && entry.Name() > report.LatestMigration {
			report.LatestMigration = entry.Name()
		}
	}
	requiredConfig := []string{"DATABASE_URL", "REDIS_URL", "JWT_SECRET", "PUBLIC_BASE_URL", "INDEX_FILE_PATH"}
	for _, key := range requiredConfig {
		report.Checks = append(report.Checks, verificationCheck{Name: "config_" + strings.ToLower(key), Required: true, Passed: strings.TrimSpace(values[key]) != "", Code: boolCode(strings.TrimSpace(values[key]) != "", "configured", "missing_required_config")})
	}
	pairOK := (values["TURNSTILE_SITE_KEY"] == "") == (values["TURNSTILE_SECRET_KEY"] == "")
	report.Checks = append(report.Checks, verificationCheck{Name: "turnstile_pair", Required: true, Passed: pairOK, Code: boolCode(pairOK, "consistent", "partial_turnstile_config")})
	if _, err := url.ParseRequestURI(origin); err != nil || origin == "" {
		report.Checks = append(report.Checks, verificationCheck{Name: "origin", Required: true, Passed: false, Code: "invalid_origin"})
		return report
	}
	for _, probe := range []struct {
		name, path string
		accepted   map[int]bool
	}{
		{name: "liveness", path: "/health", accepted: map[int]bool{200: true}},
		{name: "readiness", path: "/ready", accepted: map[int]bool{200: true}},
		{name: "session_turnstile", path: "/api/session/turnstile-config", accepted: map[int]bool{200: true, 204: true}},
		{name: "store_read", path: "/api/store/products", accepted: map[int]bool{200: true}},
		{name: "sitemap", path: "/sitemap.xml", accepted: map[int]bool{200: true}},
		{name: "spa", path: "/", accepted: map[int]bool{200: true}},
	} {
		report.Checks = append(report.Checks, runHTTPProbe(ctx, client, probe.name, strings.TrimRight(origin, "/")+probe.path, probe.accepted))
	}
	for _, check := range report.Checks {
		if check.Required && !check.Passed {
			return report
		}
	}
	report.Decision = "proceed"
	return report
}

func runHTTPProbe(ctx context.Context, client *http.Client, name, target string, accepted map[int]bool) verificationCheck {
	started := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return verificationCheck{Name: name, Required: true, Code: "invalid_request"}
	}
	resp, err := client.Do(req)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return verificationCheck{Name: name, Required: true, Code: "request_failed", LatencyMS: latency}
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	_ = resp.Body.Close()
	passed := accepted[resp.StatusCode]
	return verificationCheck{Name: name, Required: true, Passed: passed, Code: boolCode(passed, "ok", fmt.Sprintf("http_%d", resp.StatusCode)), LatencyMS: latency}
}

func cmdLoadCheck(args []string) {
	if len(args) == 0 {
		die("Usage: grengo load-check <url> [--requests N] [--concurrency N] [--allow-remote]")
	}
	target, err := url.Parse(args[0])
	if err != nil || target.Scheme == "" || target.Hostname() == "" {
		die("Invalid load-check URL")
	}
	allowRemote := hasFlag(args[1:], "--allow-remote")
	if !allowRemote && !isLoopbackHost(target.Hostname()) {
		die("Remote load checks are disabled; use --allow-remote only for an explicitly approved non-production target")
	}
	requests := boundedFlagInt(args[1:], "--requests", 50, 1, 200)
	concurrency := boundedFlagInt(args[1:], "--concurrency", 4, 1, 16)
	maxAverageMS := boundedFlagInt(args[1:], "--max-average-ms", 500, 10, 10000)
	var report map[string]any
	webSocket := hasFlag(args[1:], "--websocket")
	if webSocket && target.Scheme != "ws" && target.Scheme != "wss" {
		die("WebSocket load checks require a ws:// or wss:// URL")
	}
	if !webSocket && target.Scheme != "http" && target.Scheme != "https" {
		die("HTTP load checks require an http:// or https:// URL")
	}
	if webSocket {
		if requests > 20 {
			requests = 20
		}
		if concurrency > 4 {
			concurrency = 4
		}
		report = runWebSocketSample(context.Background(), target.String(), requests, concurrency, maxAverageMS)
	} else {
		report = runLoadSample(context.Background(), target.String(), requests, concurrency, maxAverageMS)
	}
	_ = json.NewEncoder(os.Stdout).Encode(report)
	if report["decision"] != "proceed" {
		die("Load check exceeded the error budget")
	}
}

func runLoadSample(ctx context.Context, target string, requests, concurrency, maxAverageMS int) map[string]any {
	return runLoadSampleWithClient(ctx, target, requests, concurrency, maxAverageMS, &http.Client{Timeout: 3 * time.Second})
}

func runLoadSampleWithClient(ctx context.Context, target string, requests, concurrency, maxAverageMS int, client *http.Client) map[string]any {
	jobs := make(chan struct{})
	var failures atomic.Int64
	var totalLatency atomic.Int64
	var wg sync.WaitGroup
	started := time.Now()
	for range concurrency {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range jobs {
				probe := runHTTPProbe(ctx, client, "sample", target, map[int]bool{200: true})
				totalLatency.Add(probe.LatencyMS)
				if !probe.Passed {
					failures.Add(1)
				}
			}
		}()
	}
	for range requests {
		jobs <- struct{}{}
	}
	close(jobs)
	wg.Wait()
	failed := failures.Load()
	averageLatency := totalLatency.Load() / int64(requests)
	decision := "proceed"
	if failed > 0 || averageLatency > int64(maxAverageMS) {
		decision = "stop"
	}
	return map[string]any{"decision": decision, "scenario": "http", "requests": requests, "concurrency": concurrency, "failures": failed, "average_latency_ms": averageLatency, "max_average_latency_ms": maxAverageMS, "duration_ms": time.Since(started).Milliseconds()}
}

func runWebSocketSample(ctx context.Context, target string, requests, concurrency, maxAverageMS int) map[string]any {
	jobs := make(chan struct{})
	var failures atomic.Int64
	var totalLatency atomic.Int64
	var wg sync.WaitGroup
	started := time.Now()
	for range concurrency {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range jobs {
				attempt := time.Now()
				dialCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
				headers := http.Header{"Origin": []string{webSocketOrigin(target)}}
				connection, _, err := websocket.DefaultDialer.DialContext(dialCtx, target, headers)
				cancel()
				totalLatency.Add(time.Since(attempt).Milliseconds())
				if err != nil {
					failures.Add(1)
					continue
				}
				_ = connection.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "load sample"), time.Now().Add(time.Second))
				_ = connection.Close()
			}
		}()
	}
	for range requests {
		jobs <- struct{}{}
	}
	close(jobs)
	wg.Wait()
	failed := failures.Load()
	averageLatency := totalLatency.Load() / int64(requests)
	decision := "proceed"
	if failed > 0 || averageLatency > int64(maxAverageMS) {
		decision = "stop"
	}
	return map[string]any{"decision": decision, "scenario": "websocket_reconnect", "requests": requests, "concurrency": concurrency, "failures": failed, "average_latency_ms": averageLatency, "max_average_latency_ms": maxAverageMS, "duration_ms": time.Since(started).Milliseconds()}
}

func webSocketOrigin(target string) string {
	parsed, err := url.Parse(target)
	if err != nil {
		return ""
	}
	scheme := "http"
	if parsed.Scheme == "wss" {
		scheme = "https"
	}
	return scheme + "://" + parsed.Host
}

func flagValue(args []string, flag string) string {
	for i := range args {
		if args[i] == flag && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}
func hasFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag {
			return true
		}
	}
	return false
}
func boundedFlagInt(args []string, flag string, fallback, min, max int) int {
	value, err := strconv.Atoi(flagValue(args, flag))
	if err != nil {
		return fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
func boolCode(ok bool, yes, no string) string {
	if ok {
		return yes
	}
	return no
}

func hashConfigKeys(values map[string]string) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	digest := sha256.Sum256([]byte(strings.Join(keys, "\n")))
	return fmt.Sprintf("%x", digest[:])
}
