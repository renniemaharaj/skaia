package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"time"

	"github.com/skaia/grengo/internal/services"
)

// Command execution (sync)

// apiExec is the generic command executor.
// POST /exec  {"command":"start","args":["mysite"]}
// Runs `grengo <command> <args...>` as a subprocess and returns the output.
func apiExec(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10MB limit
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid json or body too large")
		return
	}
	if req.Command == "" {
		apiError(w, http.StatusBadRequest, "command required")
		return
	}

	// Block recursive / dangerous commands.
	blocked := map[string]bool{
		"api":      true, // recursive
		"wipe":     true, // destructive
		"remove":   true, // destructive
		"rm":       true, // destructive
		"passcode": true, // credential management
	}
	if blocked[req.Command] {
		apiError(w, http.StatusBadRequest, fmt.Sprintf("command %q not allowed via API", req.Command))
		return
	}

	args := append([]string{req.Command}, req.Args...)

	result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(args...)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{
		"ok":        result.ExitCode == 0,
		"output":    result.Output,
		"exit_code": result.ExitCode,
	})
}

// apiFrappeProvision bypasses the generic passcode-protected /exec endpoint
// specifically for orchestrating Frappe instances via the internal backend.
func apiFrappeProvision(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SiteName string `json:"site_name"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.SiteName == "" {
		apiError(w, http.StatusBadRequest, "site_name required")
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	fw := &flushWriter{w: w}
	if f, ok := w.(http.Flusher); ok {
		fw.f = f
	}

	result, err := services.NewCommandRunner(ProjectRoot()).RunSelfStream(fw, "frappe-provision", req.SiteName)
	if err != nil {
		fmt.Fprintf(fw, "ERROR: %v\n", err)
	} else if result.ExitCode != 0 {
		fmt.Fprintf(fw, "ERROR: exit code %d\n", result.ExitCode)
	}
}

type flushWriter struct {
	w http.ResponseWriter
	f http.Flusher
}

func (fw *flushWriter) Write(p []byte) (n int, err error) {
	n, err = fw.w.Write(p)
	if fw.f != nil {
		fw.f.Flush()
	}
	return
}

// Async job runners (site-cmd, global-cmd)

func startSiteCommand(name, command string, extraArgs []string) string {
	jobID := fmt.Sprintf("job-cmd-%d", time.Now().UnixNano())

	j := &jobStatus{
		ID:        jobID,
		Type:      "site-cmd",
		Status:    "running",
		CreatedAt: time.Now(),
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func() {
		cmdArgs := append([]string{command, name}, extraArgs...)
		result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(cmdArgs...)
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil || result.ExitCode != 0 {
			j.Status = "failed"
			j.Error = fmt.Sprintf("%s failed: %s", command, result.Output)
			broadcastJobStatus(j)
			return
		}
		j.Status = "completed"
		broadcastJobStatus(j)
	}()
	return jobID
}

func startGlobalCommand(command string, extraArgs []string) string {
	jobID := fmt.Sprintf("job-cmd-%d", time.Now().UnixNano())

	j := &jobStatus{
		ID:        jobID,
		Type:      "global-cmd",
		Status:    "running",
		CreatedAt: time.Now(),
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func() {
		cmdArgs := append([]string{command}, extraArgs...)
		result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(cmdArgs...)
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil || result.ExitCode != 0 {
			j.Status = "failed"
			j.Error = fmt.Sprintf("%s failed: %s", command, result.Output)
			broadcastJobStatus(j)
			return
		}
		j.Status = "completed"
		broadcastJobStatus(j)
	}()
	return jobID
}

func startGenericCommand(command string, args []string) string {
	jobID := fmt.Sprintf("job-exec-%d", time.Now().UnixNano())
	j := &jobStatus{
		ID:        jobID,
		Type:      "exec",
		Target:    command,
		Status:    "running",
		CreatedAt: time.Now(),
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func() {
		cmd := exec.Command(command, args...)
		cmd.Dir = ProjectRoot()
		out, err := cmd.CombinedOutput()
		
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = string(out)
			if j.Error == "" {
				j.Error = err.Error()
			}
			broadcastJobStatus(j)
			return
		}
		j.Status = "completed"
		j.Error = string(out) // We use Error field to pass the stdout output back
		broadcastJobStatus(j)
	}()
	return jobID
}

// Migrate (sync)

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

	result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(args...)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{
		"ok":        result.ExitCode == 0,
		"output":    result.Output,
		"exit_code": result.ExitCode,
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

	result, err := services.NewCommandRunner(ProjectRoot()).RunSelf(args...)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{
		"ok":        result.ExitCode == 0,
		"output":    result.Output,
		"exit_code": result.ExitCode,
	})
}
