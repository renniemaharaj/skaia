package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
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

// ── CLI commands ───────────────────────────────────────────────────────────

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

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", apiHealth)
	mux.HandleFunc("GET /sites", apiListSites)
	mux.HandleFunc("POST /exec", apiExec)
	mux.HandleFunc("GET /export/{name}", apiExportSite)
	mux.HandleFunc("POST /import", apiImportSite)
	mux.HandleFunc("POST /verify-passcode", apiVerifyPasscode)
	mux.HandleFunc("GET /passcode/status", apiPasscodeStatus)

	srv := &http.Server{Handler: mux}

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

	os.Remove(pidFilePath())
	log("Grengo API stopped")
}

// cmdAPIStop sends SIGTERM to a running grengo API process.
func cmdAPIStop() {
	pid, err := readPIDFile()
	if err != nil {
		die("No grengo API running (no PID file)")
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		os.Remove(pidFilePath())
		die("Cannot find process %d: %v", pid, err)
	}

	if err := proc.Signal(syscall.SIGTERM); err != nil {
		os.Remove(pidFilePath())
		die("Cannot signal process %d: %v", pid, err)
	}

	log("Sent stop signal to grengo API (PID %d)", pid)
	for i := 0; i < 30; i++ {
		if !processRunning(pid) {
			log("Grengo API stopped")
			os.Remove(pidFilePath())
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	warn("API process %d did not exit within 3s", pid)
}

// cmdAPIStatus reports whether the grengo API is running.
func cmdAPIStatus() {
	pid, err := readPIDFile()
	if err != nil {
		info("Grengo API is not running")
		return
	}
	if processRunning(pid) {
		log("Grengo API is running (PID %d)", pid)
	} else {
		info("Grengo API is not running (stale PID file)")
		os.Remove(pidFilePath())
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────

func readPIDFile() (int, error) {
	data, err := os.ReadFile(pidFilePath())
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

func processRunning(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return proc.Signal(syscall.Signal(0)) == nil
}

func apiJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func apiError(w http.ResponseWriter, status int, msg string) {
	apiJSON(w, status, map[string]any{"error": msg})
}

// ── API Handlers ───────────────────────────────────────────────────────────

func apiHealth(w http.ResponseWriter, r *http.Request) {
	apiJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// apiSiteInfo holds structured site data returned by the internal API.
type apiSiteInfo struct {
	Name     string   `json:"name"`
	Port     string   `json:"port"`
	Status   string   `json:"status"`
	Running  bool     `json:"running"`
	Domains  []string `json:"domains"`
	DBName   string   `json:"db_name"`
	Features string   `json:"features"`
}

// apiListSites reads the backends/ directory and returns structured JSON.
func apiListSites(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(backendsDir())
	if err != nil {
		if os.IsNotExist(err) {
			apiJSON(w, http.StatusOK, []apiSiteInfo{})
			return
		}
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	sites := []apiSiteInfo{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ef := filepath.Join(backendsDir(), e.Name(), ".env")
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}

		name := envVal(ef, "CLIENT_NAME")
		port := envVal(ef, "PORT")
		domainsStr := envVal(ef, "DOMAINS")
		dbName := envVal(ef, "POSTGRES_DB")
		features := envVal(ef, "FEATURES_ENABLED")

		status := "enabled"
		if _, serr := os.Stat(filepath.Join(backendsDir(), e.Name(), ".disabled")); serr == nil {
			status = "disabled"
		}

		running := clientRunning(name)

		domains := []string{}
		if domainsStr != "" {
			domains = strings.Fields(domainsStr)
		}

		sites = append(sites, apiSiteInfo{
			Name:     name,
			Port:     port,
			Status:   status,
			Running:  running,
			Domains:  domains,
			DBName:   dbName,
			Features: features,
		})
	}

	apiJSON(w, http.StatusOK, sites)
}

// apiExec is the generic command executor.
// POST /exec  {"command":"start","args":["mysite"]}
// Runs `grengo <command> <args...>` as a subprocess and returns the output.
func apiExec(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Command == "" {
		apiError(w, http.StatusBadRequest, "command required")
		return
	}

	// Block recursive / dangerous commands.
	blocked := map[string]bool{"api": true}
	if blocked[req.Command] {
		apiError(w, http.StatusBadRequest, fmt.Sprintf("command %q not allowed via API", req.Command))
		return
	}

	args := append([]string{req.Command}, req.Args...)

	self, err := os.Executable()
	if err != nil {
		apiError(w, http.StatusInternalServerError, "cannot determine executable path")
		return
	}

	cmd := exec.Command(self, args...)
	cmd.Dir = ProjectRoot()
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	output, err := cmd.CombinedOutput()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			apiError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	apiJSON(w, http.StatusOK, map[string]any{
		"ok":        exitCode == 0,
		"output":    string(output),
		"exit_code": exitCode,
	})
}

// apiExportSite runs export and streams the archive back.
func apiExportSite(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}

	dir := filepath.Join(backendsDir(), name)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	archiveName := fmt.Sprintf("grengo-client-%s-%s.tar.gz", name, time.Now().Format("20060102-150405"))
	outPath := filepath.Join(os.TempDir(), archiveName)
	defer os.Remove(outPath)

	self, _ := os.Executable()
	cmd := exec.Command(self, "export", name, "-o", outPath)
	cmd.Dir = ProjectRoot()
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	if output, err := cmd.CombinedOutput(); err != nil {
		apiError(w, http.StatusInternalServerError, fmt.Sprintf("export failed: %s", string(output)))
		return
	}

	f, err := os.Open(outPath)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "cannot open export archive")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", "attachment; filename="+archiveName)
	io.Copy(w, f)
}

// apiImportSite accepts a multipart archive upload and imports it.
func apiImportSite(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(256 << 20); err != nil {
		apiError(w, http.StatusBadRequest, "multipart form required (max 256MB)")
		return
	}

	file, _, err := r.FormFile("archive")
	if err != nil {
		apiError(w, http.StatusBadRequest, "archive file required")
		return
	}
	defer file.Close()

	tmpFile, err := os.CreateTemp("", "grengo-import-*.tar.gz")
	if err != nil {
		apiError(w, http.StatusInternalServerError, "cannot create temp file")
		return
	}
	defer os.Remove(tmpFile.Name())

	if _, err := io.Copy(tmpFile, file); err != nil {
		tmpFile.Close()
		apiError(w, http.StatusInternalServerError, "failed to save upload")
		return
	}
	tmpFile.Close()

	args := []string{"import", tmpFile.Name()}
	if n := r.FormValue("name"); n != "" {
		args = append(args, "--name", n)
	}
	if p := r.FormValue("port"); p != "" {
		args = append(args, "--port", p)
	}

	self, _ := os.Executable()
	cmd := exec.Command(self, args...)
	cmd.Dir = ProjectRoot()
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	output, err := cmd.CombinedOutput()
	if err != nil {
		apiError(w, http.StatusInternalServerError, fmt.Sprintf("import failed: %s", string(output)))
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// apiVerifyPasscode checks a passcode pair against the stored .pcode file.
func apiVerifyPasscode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		P1 string `json:"p1"`
		P2 string `json:"p2"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid json")
		return
	}

	configured := passcodeConfigured()
	if !configured {
		apiJSON(w, http.StatusOK, map[string]any{
			"configured": false,
			"valid":      false,
		})
		return
	}

	valid := verifyPasscode(req.P1, req.P2)
	apiJSON(w, http.StatusOK, map[string]any{
		"configured": true,
		"valid":      valid,
	})
}

// apiPasscodeStatus reports whether a passcode is configured.
func apiPasscodeStatus(w http.ResponseWriter, r *http.Request) {
	apiJSON(w, http.StatusOK, map[string]any{
		"configured": passcodeConfigured(),
	})
}
