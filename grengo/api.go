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
	mux.HandleFunc("GET /export-node", apiExportNode)
	mux.HandleFunc("POST /import-node", apiImportNode)
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
	Armed    bool     `json:"armed"`
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

		// Check armed status: look for any .armed file inside the client's armed/ dir.
		armedDir := filepath.Join(backendsDir(), e.Name(), "armed")
		armed := false
		if aEntries, aerr := os.ReadDir(armedDir); aerr == nil {
			for _, ae := range aEntries {
				if !ae.IsDir() {
					armed = true
					break
				}
			}
		}

		domains := []string{}
		if domainsStr != "" {
			domains = strings.Fields(domainsStr)
		}

		sites = append(sites, apiSiteInfo{
			Name:     name,
			Port:     port,
			Status:   status,
			Running:  running,
			Armed:    armed,
			Domains:  domains,
			DBName:   dbName,
			Features: features,
		})
	}

	apiJSON(w, http.StatusOK, sites)
}

// containerStats holds metrics for a single container.
type containerStats struct {
	Name     string  `json:"name"`
	CPU      float64 `json:"cpu_percent"`
	MemUsage string  `json:"mem_usage"`
	MemLimit string  `json:"mem_limit"`
	MemPct   float64 `json:"mem_percent"`
	NetIO    string  `json:"net_io"`
	BlockIO  string  `json:"block_io"`
	PIDs     int     `json:"pids"`
}

// apiGetEnv returns the raw .env file content for a site.
func apiGetEnv(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}

	envFile := filepath.Join(backendsDir(), name, ".env")
	data, err := os.ReadFile(envFile)
	if err != nil {
		if os.IsNotExist(err) {
			apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
			return
		}
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"content": string(data)})
}

// apiPutEnv overwrites the .env file for a site.
func apiPutEnv(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}

	envFile := filepath.Join(backendsDir(), name, ".env")
	if _, err := os.Stat(envFile); os.IsNotExist(err) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apiError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if err := os.WriteFile(envFile, []byte(body.Content), 0644); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// dockerAPIClient talks to the Docker Engine API via the Unix socket.
var dockerAPIClient = &http.Client{
	Transport: &http.Transport{
		DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
			return net.Dial("unix", "/var/run/docker.sock")
		},
	},
	Timeout: 10 * time.Second,
}

// dockerStatsJSON is the raw structure returned by GET /containers/{id}/stats?stream=false.
type dockerStatsJSON struct {
	Read     string `json:"read"`
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	PrecpuStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
		Stats struct {
			Cache uint64 `json:"cache"`
		} `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IoServiceBytesRecursive []struct {
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
	PidsStats struct {
		Current int `json:"current"`
	} `json:"pids_stats"`
}

// fetchContainerStats fetches stats for one container via the Docker Engine API.
func fetchContainerStats(name string) (*containerStats, error) {
	url := fmt.Sprintf("http://localhost/containers/%s/stats?stream=false&one-shot=true", name)
	resp, err := dockerAPIClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("docker API %d for %s", resp.StatusCode, name)
	}

	var raw dockerStatsJSON
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	// CPU %
	cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage - raw.PrecpuStats.CPUUsage.TotalUsage)
	sysDelta := float64(raw.CPUStats.SystemCPUUsage - raw.PrecpuStats.SystemCPUUsage)
	cpuPct := 0.0
	if sysDelta > 0 && cpuDelta > 0 {
		cpuPct = cpuDelta / sysDelta * float64(raw.CPUStats.OnlineCPUs) * 100.0
	}

	// Memory
	memUsage := raw.MemoryStats.Usage - raw.MemoryStats.Stats.Cache
	memLimit := raw.MemoryStats.Limit
	memPct := 0.0
	if memLimit > 0 {
		memPct = float64(memUsage) / float64(memLimit) * 100.0
	}

	// Net I/O
	var rxBytes, txBytes uint64
	for _, iface := range raw.Networks {
		rxBytes += iface.RxBytes
		txBytes += iface.TxBytes
	}

	// Block I/O
	var blkRead, blkWrite uint64
	for _, entry := range raw.BlkioStats.IoServiceBytesRecursive {
		switch entry.Op {
		case "read", "Read":
			blkRead += entry.Value
		case "write", "Write":
			blkWrite += entry.Value
		}
	}

	return &containerStats{
		Name:     name,
		CPU:      cpuPct,
		MemUsage: humanBytes(memUsage),
		MemLimit: humanBytes(memLimit),
		MemPct:   memPct,
		NetIO:    fmt.Sprintf("%s / %s", humanBytes(rxBytes), humanBytes(txBytes)),
		BlockIO:  fmt.Sprintf("%s / %s", humanBytes(blkRead), humanBytes(blkWrite)),
		PIDs:     raw.PidsStats.Current,
	}, nil
}

// humanBytes formats bytes into a human-readable string (KiB, MiB, GiB).
func humanBytes(b uint64) string {
	const (
		kib = 1024
		mib = kib * 1024
		gib = mib * 1024
	)
	switch {
	case b >= gib:
		return fmt.Sprintf("%.2f GiB", float64(b)/float64(gib))
	case b >= mib:
		return fmt.Sprintf("%.1f MiB", float64(b)/float64(mib))
	case b >= kib:
		return fmt.Sprintf("%.1f KiB", float64(b)/float64(kib))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

// apiStats returns docker stats for all running grengo-managed containers.
func apiStats(w http.ResponseWriter, r *http.Request) {
	// Get running container names matching *-backend plus shared infra.
	entries, _ := os.ReadDir(backendsDir())
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ef := filepath.Join(backendsDir(), e.Name(), ".env")
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}
		cname := envVal(ef, "CLIENT_NAME")
		if cname != "" && clientRunning(cname) {
			names = append(names, cname+"-backend")
		}
	}

	// Also include shared infra containers (postgres, redis, nginx).
	for _, infra := range []string{"skaia-postgres", "skaia-redis", "skaia-nginx"} {
		if containerRunning(infra) {
			names = append(names, infra)
		}
	}

	if len(names) == 0 {
		apiJSON(w, http.StatusOK, []containerStats{})
		return
	}

	// Fetch stats concurrently via Docker Engine API (Unix socket).
	type result struct {
		stats *containerStats
		err   error
	}
	ch := make(chan result, len(names))
	for _, n := range names {
		go func(name string) {
			s, err := fetchContainerStats(name)
			ch <- result{s, err}
		}(n)
	}

	var stats []containerStats
	for range names {
		res := <-ch
		if res.err == nil && res.stats != nil {
			stats = append(stats, *res.stats)
		}
	}

	apiJSON(w, http.StatusOK, stats)
}

// storageInfo holds per-site and total upload storage metrics for the dashboard.
type storageInfo struct {
	Sites      []siteStorageInfo `json:"sites"`
	TotalUsed  int64             `json:"total_used"`
	TotalLimit int64             `json:"total_limit"`
	TotalPct   float64           `json:"total_percent"`
	TotalHuman string            `json:"total_used_human"`
	LimitHuman string            `json:"total_limit_human"`
}

type siteStorageInfo struct {
	Name      string `json:"name"`
	Used      int64  `json:"used"`
	UsedHuman string `json:"used_human"`
}

// apiStorage returns upload storage usage for all sites.
func apiStorage(w http.ResponseWriter, r *http.Request) {
	entries, _ := os.ReadDir(backendsDir())

	var sites []siteStorageInfo
	var grandTotal int64

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ef := filepath.Join(backendsDir(), e.Name(), ".env")
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}

		name := envVal(ef, "CLIENT_NAME")
		uploadsDir := filepath.Join(backendsDir(), e.Name(), "uploads")

		var used int64
		_ = filepath.Walk(uploadsDir, func(_ string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			used += info.Size()
			return nil
		})
		grandTotal += used

		sites = append(sites, siteStorageInfo{
			Name:      name,
			Used:      used,
			UsedHuman: humanBytes(uint64(used)),
		})
	}

	// Total upload limit: read from env or default 5 GB.
	var totalLimit int64 = 5 * 1024 * 1024 * 1024 // 5 GB
	if v := os.Getenv("MAX_UPLOAD_TOTAL_MB"); v != "" {
		if mb, err := strconv.ParseInt(v, 10, 64); err == nil && mb > 0 {
			totalLimit = mb * 1024 * 1024
		}
	}

	totalPct := 0.0
	if totalLimit > 0 {
		totalPct = float64(grandTotal) / float64(totalLimit) * 100
	}

	apiJSON(w, http.StatusOK, storageInfo{
		Sites:      sites,
		TotalUsed:  grandTotal,
		TotalLimit: totalLimit,
		TotalPct:   totalPct,
		TotalHuman: humanBytes(uint64(grandTotal)),
		LimitHuman: humanBytes(uint64(totalLimit)),
	})
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

// apiArmSite creates a .armed sentinel file in the site's armed/ directory.
func apiArmSite(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}
	siteDir := filepath.Join(backendsDir(), name)
	if _, err := os.Stat(siteDir); os.IsNotExist(err) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	armedDir := filepath.Join(siteDir, "armed")
	if err := os.MkdirAll(armedDir, 0755); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	armedFile := filepath.Join(armedDir, name+".armed")
	if err := os.WriteFile(armedFile, []byte(time.Now().UTC().Format(time.RFC3339)), 0644); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Also write into the running container's armed/ dir (mounted at /app/armed).
	// The site container reads from its own local armed/ directory.
	// Since we volume-mount ./armed:/app/armed we've already written the file above.

	apiJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": true})
}

// apiDisarmSite removes the .armed sentinel file for a site.
func apiDisarmSite(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}
	siteDir := filepath.Join(backendsDir(), name)
	if _, err := os.Stat(siteDir); os.IsNotExist(err) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	armedDir := filepath.Join(siteDir, "armed")
	armedFile := filepath.Join(armedDir, name+".armed")
	if err := os.Remove(armedFile); err != nil && !os.IsNotExist(err) {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": false})
}

// apiSysInfo returns host CPU info, server time, and uptime.
func apiSysInfo(w http.ResponseWriter, r *http.Request) {
	info := map[string]any{
		"server_time": time.Now().UTC().Format(time.RFC3339),
	}

	// CPU model
	if data, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "model name") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					info["cpu_model"] = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}

	// CPU count
	if data, err := os.ReadFile("/proc/cpuinfo"); err == nil {
		count := 0
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "processor") {
				count++
			}
		}
		info["cpu_cores"] = count
	}

	// System uptime
	if data, err := os.ReadFile("/proc/uptime"); err == nil {
		parts := strings.Fields(string(data))
		if len(parts) >= 1 {
			if secs, err := strconv.ParseFloat(parts[0], 64); err == nil {
				info["uptime_seconds"] = secs
				d := time.Duration(secs * float64(time.Second))
				days := int(d.Hours()) / 24
				hours := int(d.Hours()) % 24
				mins := int(d.Minutes()) % 60
				info["uptime_human"] = fmt.Sprintf("%dd %dh %dm", days, hours, mins)
			}
		}
	}

	// Total system memory
	if data, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "MemTotal:") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					if kb, err := strconv.ParseUint(parts[1], 10, 64); err == nil {
						info["mem_total"] = humanBytes(kb * 1024)
					}
				}
				break
			}
		}
	}

	// Load average
	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		parts := strings.Fields(string(data))
		if len(parts) >= 3 {
			info["load_avg"] = strings.Join(parts[:3], " ")
		}
	}

	apiJSON(w, http.StatusOK, info)
}

// apiMigrateSite runs migrations for a single site.
func apiMigrateSite(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}

	var body struct {
		Rebuild bool `json:"rebuild"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	args := []string{"migrate", name}
	if body.Rebuild {
		args = append(args, "--rebuild")
	}

	self, err := os.Executable()
	if err != nil {
		apiError(w, http.StatusInternalServerError, "cannot determine executable path")
		return
	}

	cmd := exec.Command(self, args...)
	cmd.Dir = ProjectRoot()
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	output, cmdErr := cmd.CombinedOutput()
	exitCode := 0
	if cmdErr != nil {
		if exitErr, ok := cmdErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			apiError(w, http.StatusInternalServerError, cmdErr.Error())
			return
		}
	}

	apiJSON(w, http.StatusOK, map[string]any{
		"ok":        exitCode == 0,
		"output":    string(output),
		"exit_code": exitCode,
	})
}

// apiMigrateAll runs migrations for all sites.
func apiMigrateAll(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Rebuild bool `json:"rebuild"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	args := []string{"migrate", "all"}
	if body.Rebuild {
		args = append(args, "--rebuild")
	}

	self, err := os.Executable()
	if err != nil {
		apiError(w, http.StatusInternalServerError, "cannot determine executable path")
		return
	}

	cmd := exec.Command(self, args...)
	cmd.Dir = ProjectRoot()
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	output, cmdErr := cmd.CombinedOutput()
	exitCode := 0
	if cmdErr != nil {
		if exitErr, ok := cmdErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			apiError(w, http.StatusInternalServerError, cmdErr.Error())
			return
		}
	}

	apiJSON(w, http.StatusOK, map[string]any{
		"ok":        exitCode == 0,
		"output":    string(output),
		"exit_code": exitCode,
	})
}

// apiExportNode exports all clients as a single node archive.
func apiExportNode(w http.ResponseWriter, r *http.Request) {
	outPath := filepath.Join(os.TempDir(), fmt.Sprintf("grengo-node-%s.tar.gz", time.Now().Format("20060102-150405")))
	defer os.Remove(outPath)

	self, _ := os.Executable()
	cmd := exec.Command(self, "export-node", "-o", outPath)
	cmd.Dir = ProjectRoot()
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	if output, err := cmd.CombinedOutput(); err != nil {
		apiError(w, http.StatusInternalServerError, fmt.Sprintf("export-node failed: %s", string(output)))
		return
	}

	f, err := os.Open(outPath)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "cannot open node archive")
		return
	}
	defer f.Close()

	archiveName := filepath.Base(outPath)
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", "attachment; filename="+archiveName)
	io.Copy(w, f)
}

// apiImportNode accepts a multipart node archive upload and imports it.
func apiImportNode(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(512 << 20); err != nil {
		apiError(w, http.StatusBadRequest, "multipart form required (max 512MB)")
		return
	}

	file, _, err := r.FormFile("archive")
	if err != nil {
		apiError(w, http.StatusBadRequest, "archive file required")
		return
	}
	defer file.Close()

	tmpFile, err := os.CreateTemp("", "grengo-import-node-*.tar.gz")
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

	self, _ := os.Executable()
	cmd := exec.Command(self, "import-node", tmpFile.Name())
	cmd.Dir = ProjectRoot()
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	output, cmdErr := cmd.CombinedOutput()
	if cmdErr != nil {
		apiError(w, http.StatusInternalServerError, fmt.Sprintf("import-node failed: %s", string(output)))
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
