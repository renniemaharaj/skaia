package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"time"
)

// ---------------------------------------------------------------------------
// Command execution (sync)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Async job runners (site-cmd, global-cmd)
// ---------------------------------------------------------------------------

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
		self, _ := os.Executable()
		cmdArgs := append([]string{command, name}, extraArgs...)
		cmd := exec.Command(self, cmdArgs...)
		cmd.Dir = ProjectRoot()
		cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

		output, err := cmd.CombinedOutput()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("%s failed: %s", command, string(output))
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
		self, _ := os.Executable()
		cmdArgs := append([]string{command}, extraArgs...)
		cmd := exec.Command(self, cmdArgs...)
		cmd.Dir = ProjectRoot()
		cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

		output, err := cmd.CombinedOutput()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("%s failed: %s", command, string(output))
			broadcastJobStatus(j)
			return
		}
		j.Status = "completed"
		broadcastJobStatus(j)
	}()
	return jobID
}

// ---------------------------------------------------------------------------
// Migrate (sync)
// ---------------------------------------------------------------------------

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
