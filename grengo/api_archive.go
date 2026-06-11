package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// ---------------------------------------------------------------------------
// Export / Import (site & node)
// ---------------------------------------------------------------------------

func startSiteExport(name string) string {
	jobID := fmt.Sprintf("job-site-%d", time.Now().UnixNano())
	archiveName := fmt.Sprintf("grengo-client-%s-%s.tar.gz", name, time.Now().Format("20060102-150405"))
	outPath := filepath.Join(os.TempDir(), archiveName)

	j := &jobStatus{
		ID:        jobID,
		Type:      "export-site",
		Status:    "running",
		CreatedAt: time.Now(),
		filePath:  outPath,
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func() {
		self, _ := os.Executable()
		cmd := exec.Command(self, "export", name, "-o", outPath)
		cmd.Dir = ProjectRoot()
		cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

		output, err := cmd.CombinedOutput()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("export failed: %s", string(output))
			broadcastJobStatus(j)
			os.Remove(outPath)
			return
		}
		j.Status = "completed"
		broadcastJobStatus(j)
	}()
	return jobID
}

func startNodeExport() string {
	jobID := fmt.Sprintf("job-node-%d", time.Now().UnixNano())
	outPath := filepath.Join(os.TempDir(), fmt.Sprintf("grengo-node-%s.tar.gz", time.Now().Format("20060102-150405")))

	j := &jobStatus{
		ID:        jobID,
		Type:      "export-node",
		Status:    "running",
		CreatedAt: time.Now(),
		filePath:  outPath,
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func() {
		self, _ := os.Executable()
		cmd := exec.Command(self, "export-node", "-o", outPath)
		cmd.Dir = ProjectRoot()
		cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

		output, err := cmd.CombinedOutput()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("export-node failed: %s", string(output))
			broadcastJobStatus(j)
			os.Remove(outPath)
			return
		}
		j.Status = "completed"
		broadcastJobStatus(j)
	}()
	return jobID
}

// apiExportSite runs export in the background and returns a job ID.
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

	jobID := startSiteExport(name)
	apiJSON(w, http.StatusAccepted, map[string]any{"job_id": jobID})
}

// apiExportNode exports all clients in the background and returns a job ID.
func apiExportNode(w http.ResponseWriter, r *http.Request) {
	jobID := startNodeExport()
	apiJSON(w, http.StatusAccepted, map[string]any{"job_id": jobID})
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

	jobID := fmt.Sprintf("job-import-%d", time.Now().UnixNano())
	j := &jobStatus{
		ID:        jobID,
		Type:      "import-site",
		Status:    "running",
		CreatedAt: time.Now(),
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func(tmpPath string) {
		defer os.Remove(tmpPath)
		self, _ := os.Executable()
		cmd := exec.Command(self, args...)
		cmd.Dir = ProjectRoot()
		cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

		output, err := cmd.CombinedOutput()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("import failed: %s", string(output))
			broadcastJobStatus(j)
			return
		}
		j.Status = "completed"
		broadcastJobStatus(j)
	}(tmpFile.Name())

	apiJSON(w, http.StatusAccepted, map[string]any{"job_id": jobID})
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

	jobID := fmt.Sprintf("job-import-node-%d", time.Now().UnixNano())
	j := &jobStatus{
		ID:        jobID,
		Type:      "import-node",
		Status:    "running",
		CreatedAt: time.Now(),
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func(tmpPath string) {
		defer os.Remove(tmpPath)
		self, _ := os.Executable()
		cmd := exec.Command(self, "import", tmpPath)
		cmd.Dir = ProjectRoot()
		cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

		output, err := cmd.CombinedOutput()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("node import failed: %s", string(output))
			broadcastJobStatus(j)
			return
		}
		j.Status = "completed"
		broadcastJobStatus(j)
	}(tmpFile.Name())

	apiJSON(w, http.StatusAccepted, map[string]any{"job_id": jobID})
}
