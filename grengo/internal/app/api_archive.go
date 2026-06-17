package app

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"
)

// Export / Import (site & node)

func startSiteExport(name string) string {
	exportsDir := filepath.Join(ProjectRoot(), "exports")
	os.MkdirAll(exportsDir, 0755)
	jobID := fmt.Sprintf("job-site-%d", time.Now().UnixNano())
	archiveName := fmt.Sprintf("grengo-client-%s-%s.tar.gz", name, time.Now().Format("20060102-150405"))
	outPath := filepath.Join(exportsDir, archiveName)

	j := &jobStatus{
		ID:        jobID,
		Type:      "export-site",
		Target:    name,
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

		stdout, _ := cmd.StdoutPipe()
		cmd.Stderr = cmd.Stdout
		cmd.Start()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			jobsMu.Lock()
			j.Message = line
			broadcastJobStatus(j)
			jobsMu.Unlock()
		}
		if err := scanner.Err(); err != nil {
			jobsMu.Lock()
			j.Status = "failed"
			j.Error = fmt.Sprintf("export-node output scan error: %v", err)
			broadcastJobStatus(j)
			jobsMu.Unlock()
			cmd.Wait()
			os.Remove(outPath)
			return
		}
		err := cmd.Wait()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("export failed: %s (%v)", j.Message, err)
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
	exportsDir := filepath.Join(ProjectRoot(), "exports")
	os.MkdirAll(exportsDir, 0755)
	jobID := fmt.Sprintf("job-node-%d", time.Now().UnixNano())
	outPath := filepath.Join(exportsDir, fmt.Sprintf("grengo-node-%s.tar.gz", time.Now().Format("20060102-150405")))

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

		stdout, _ := cmd.StdoutPipe()
		cmd.Stderr = cmd.Stdout
		cmd.Start()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			jobsMu.Lock()
			j.Message = line
			broadcastJobStatus(j)
			jobsMu.Unlock()
		}
		if err := scanner.Err(); err != nil {
			jobsMu.Lock()
			j.Status = "failed"
			j.Error = fmt.Sprintf("export-node output scan error: %v", err)
			broadcastJobStatus(j)
			jobsMu.Unlock()
			cmd.Wait()
			os.Remove(outPath)
			return
		}
		err := cmd.Wait()
		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("export-node failed: %s (%v)", j.Message, err)
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

// apiListExports returns a list of files in the exports directory.
func apiListExports(w http.ResponseWriter, r *http.Request) {
	exportsDir := filepath.Join(ProjectRoot(), "exports")
	os.MkdirAll(exportsDir, 0755)

	entries, err := os.ReadDir(exportsDir)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "cannot read exports directory")
		return
	}

	type ExportFile struct {
		Name      string    `json:"name"`
		Size      int64     `json:"size"`
		CreatedAt time.Time `json:"created_at"`
	}
	var files []ExportFile
	for _, e := range entries {
		if !e.IsDir() {
			if info, err := e.Info(); err == nil {
				files = append(files, ExportFile{
					Name:      e.Name(),
					Size:      info.Size(),
					CreatedAt: info.ModTime(),
				})
			}
		}
	}
	apiJSON(w, http.StatusOK, files)
}

func apiDownloadExport(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" || filepath.Base(filename) != filename {
		apiError(w, http.StatusBadRequest, "invalid filename")
		return
	}
	filePath := filepath.Join(ProjectRoot(), "exports", filename)
	f, err := os.Open(filePath)
	if err != nil {
		apiError(w, http.StatusNotFound, "file not found")
		return
	}
	defer f.Close()

	info, err := f.Stat()
	if err == nil {
		w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	}

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	io.Copy(w, f)
}

func apiDeleteExport(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" || filepath.Base(filename) != filename {
		apiError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	jobID := fmt.Sprintf("job-%s", time.Now().Format("20060102-150405"))
	j := &jobStatus{
		ID:        jobID,
		Type:      "delete-export",
		Status:    "running",
		Target:    filename,
		Message:   "Deleting export...",
		CreatedAt: time.Now(),
	}
	jobsMu.Lock()
	jobs[jobID] = j
	broadcastJobStatus(j)
	jobsMu.Unlock()

	go func() {
		filePath := filepath.Join(ProjectRoot(), "exports", filename)
		err := os.Remove(filePath)

		jobsMu.Lock()
		defer jobsMu.Unlock()

		if err != nil {
			j.Status = "failed"
			j.Error = fmt.Sprintf("failed to delete: %v", err)
			broadcastJobStatus(j)
			return
		}
		j.Status = "completed"
		j.Message = "Export deleted"
		broadcastJobStatus(j)
	}()

	apiJSON(w, http.StatusAccepted, map[string]any{"job_id": jobID})
}
