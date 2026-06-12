package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	DefaultAPIPort = 9100
	pidFileName    = ".grengo-api.pid"
)

func pidFilePath() string {
	return filepath.Join(ProjectRoot(), pidFileName)
}

// ---------------------------------------------------------------------------
// API lifecycle commands
// ---------------------------------------------------------------------------

// cmdAPIStart launches the internal grengo API server.
// It binds to 0.0.0.0 so Docker containers on the host can reach it,
// but it is NOT meant to be exposed to the internet (keep behind firewall).
func cmdAPIStart(port int) {
	if port <= 0 {
		port = DefaultAPIPort
	}

	// Check for an existing process.
	if pid, err := readPIDFile(); err == nil {
		if processRunning(pid) {
			die("Grengo API is already running (PID %d). Stop it first: grengo api stop", pid)
		}
		os.Remove(pidFilePath())
	}

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		die("Cannot listen on %s: %v", addr, err)
	}

	// Write PID file.
	if err := os.WriteFile(pidFilePath(), []byte(strconv.Itoa(os.Getpid())), 0644); err != nil {
		warn("Cannot write PID file: %v", err)
	}

	go broadcastStatsAndStorageLoop()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", apiHealth)
	mux.HandleFunc("GET /sites", apiListSites)
	mux.HandleFunc("GET /stats", apiStats)
	mux.HandleFunc("GET /storage", apiStorage)
	mux.HandleFunc("GET /sysinfo", apiSysInfo)
	mux.HandleFunc("GET /env/{name}", apiGetEnv)
	mux.HandleFunc("PUT /env/{name}", apiPutEnv)
	mux.HandleFunc("POST /exec", apiExec)
	mux.HandleFunc("GET /export/{name}", apiExportSite)
	mux.HandleFunc("POST /import", apiImportSite)
	mux.HandleFunc("POST /sites/{name}/arm", apiArmSite)
	mux.HandleFunc("POST /sites/{name}/disarm", apiDisarmSite)
	mux.HandleFunc("POST /sites/{name}/migrate", apiMigrateSite)
	mux.HandleFunc("POST /migrate-all", apiMigrateAll)
	mux.HandleFunc("POST /export-node", apiExportNode)
	mux.HandleFunc("POST /import-node", apiImportNode)
	mux.HandleFunc("GET /jobs", apiListJobs)
	mux.HandleFunc("GET /jobs/{id}", apiGetJob)
	mux.HandleFunc("GET /jobs/{id}/download", apiDownloadJob)
	mux.HandleFunc("GET /exports", apiListExports)
	mux.HandleFunc("GET /exports/{filename}/download", apiDownloadExport)
	mux.HandleFunc("DELETE /exports/{filename}", apiDeleteExport)
	mux.HandleFunc("GET /ws", apiWebSocket)
	mux.HandleFunc("POST /verify-passcode", apiVerifyPasscode)
	mux.HandleFunc("GET /passcode/status", apiPasscodeStatus)

	srv := &http.Server{Handler: apiPasscodeMiddleware(mux)}

	// Graceful shutdown on SIGINT / SIGTERM.
	done := make(chan os.Signal, 1)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-done
		log("Shutting down grengo API…")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	log("Grengo internal API listening on %s (PID %d)", addr, os.Getpid())
	info("Accessible from this host and local Docker containers")
	info("Stop with: grengo api stop  (or Ctrl-C)")

	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		die("Server error: %v", err)
	}
	log("Grengo API stopped")
	os.Remove(pidFilePath())
}

// cmdAPIStop sends SIGTERM to a running grengo API process.
func cmdAPIStop() {
	pid, err := readPIDFile()
	if err != nil {
		die("Grengo API is not running (no PID file)")
	}
	if !processRunning(pid) {
		os.Remove(pidFilePath())
		die("Grengo API is not running (stale PID file)")
	}

	p, err := os.FindProcess(pid)
	if err != nil {
		die("Cannot find process %d: %v", pid, err)
	}
	if err := p.Signal(syscall.SIGTERM); err != nil {
		die("Cannot send signal to PID %d: %v", pid, err)
	}
	log("Sent stop signal to grengo API (PID %d)", pid)

	// Wait briefly for the process to exit.
	for i := 0; i < 20; i++ {
		time.Sleep(250 * time.Millisecond)
		if !processRunning(pid) {
			log("Grengo API stopped")
			os.Remove(pidFilePath())
			return
		}
	}
	warn("Process %d did not exit in 5s — may still be shutting down", pid)
}

func cmdAPIStatus() {
	pid, err := readPIDFile()
	if err != nil {
		info("Grengo API is not running")
		return
	}
	if processRunning(pid) {
		info("Grengo API is running (PID %d)", pid)
	} else {
		info("Grengo API is not running (stale PID file)")
		os.Remove(pidFilePath())
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func readPIDFile() (int, error) {
	data, err := os.ReadFile(pidFilePath())
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

func processRunning(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}

func apiJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func apiError(w http.ResponseWriter, status int, msg string) {
	apiJSON(w, status, map[string]any{"error": msg})
}

// apiPasscodeMiddleware gates internal API routes behind passcode authentication.
// Routes that are always open: GET /health, POST /verify-passcode, GET /passcode/status.
// When no passcode is configured (.pcode absent), all routes are open for backward
// compatibility — the server logs a warning on startup in that case.
func apiPasscodeMiddleware(next http.Handler) http.Handler {
	// Paths exempt from passcode checks.
	openPaths := map[string]bool{
		"/health":          true,
		"/verify-passcode": true,
		"/passcode/status": true,
		"/ws":              true,
		"/storage":         true,
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if openPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}

		// If no passcode is configured, allow all requests (backward compat).
		if !passcodeConfigured() {
			next.ServeHTTP(w, r)
			return
		}

		// Expect header: X-Grengo-Passcode: <p1>:<p2>
		header := r.Header.Get("X-Grengo-Passcode")
		if header == "" {
			apiError(w, http.StatusUnauthorized, "passcode required")
			return
		}

		parts := strings.SplitN(header, ":", 2)
		if len(parts) != 2 || !verifyPasscode(parts[0], parts[1]) {
			apiError(w, http.StatusUnauthorized, "invalid passcode")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func apiHealth(w http.ResponseWriter, r *http.Request) {
	apiJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}
