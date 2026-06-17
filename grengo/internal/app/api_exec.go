package app

import (
	"encoding/json"
	"fmt"
	"net/http"
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
