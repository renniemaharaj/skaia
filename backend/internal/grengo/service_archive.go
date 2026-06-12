package grengo

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ExportSite starts an async export job via the grengo API and returns the job ID.
func (s *Service) ExportSite(name string) (string, error) {
	resp, err := s.client.Get(fmt.Sprintf("%s/export/%s", s.apiURL, name))
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		return "", s.readAPIError(resp)
	}

	var result struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode export response: %w", err)
	}
	return result.JobID, nil
}

// ImportSite uploads an archive to the grengo API for import.
func (s *Service) ImportSite(archivePath, newName, newPort string) (string, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return "", fmt.Errorf("open archive: %w", err)
	}

	pr, pw := io.Pipe()
	w := multipart.NewWriter(pw)

	go func() {
		defer pw.Close()
		defer f.Close()
		fw, err := w.CreateFormFile("archive", filepath.Base(archivePath))
		if err == nil {
			io.Copy(fw, f)
		}
		if newName != "" {
			w.WriteField("name", newName)
		}
		if newPort != "" {
			w.WriteField("port", newPort)
		}
		w.Close()
	}()

	req, err := http.NewRequest(http.MethodPost, s.apiURL+"/import", pr)
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return "", s.readAPIError(resp)
	}
	var result struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
		return result.JobID, nil
	}
	return "", nil
}

// ExportNode starts an async node export job via the grengo API and returns the job ID.
func (s *Service) ExportNode() (string, error) {
	resp, err := s.client.Post(s.apiURL+"/export-node", "application/json", nil)
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		return "", s.readAPIError(resp)
	}

	var result struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode export-node response: %w", err)
	}
	return result.JobID, nil
}

// ImportNode imports an entire node state via the grengo API.
func (s *Service) ImportNode(archivePath string) (string, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return "", fmt.Errorf("open archive: %w", err)
	}

	pr, pw := io.Pipe()
	w := multipart.NewWriter(pw)

	go func() {
		defer pw.Close()
		defer f.Close()
		fw, err := w.CreateFormFile("archive", filepath.Base(archivePath))
		if err == nil {
			io.Copy(fw, f)
		}
		w.Close()
	}()

	req, err := http.NewRequest(http.MethodPost, s.apiURL+"/import-node", pr)
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return "", s.readAPIError(resp)
	}
	var result struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
		return result.JobID, nil
	}
	return "", nil
}

// MigrateResult holds the output of a migration command.
type MigrateResult struct {
	OK       bool   `json:"ok"`
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
}

// MigrateSite runs migrations for a single site.
func (s *Service) MigrateSite(name string, rebuild bool) (*MigrateResult, error) {
	body, _ := json.Marshal(map[string]bool{"rebuild": rebuild})
	resp, err := s.client.Post(fmt.Sprintf("%s/sites/%s/migrate", s.apiURL, name), "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	var result MigrateResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode migrate: %w", err)
	}
	return &result, nil
}

// MigrateAll runs migrations for all sites.
func (s *Service) MigrateAll(rebuild bool) (*MigrateResult, error) {
	body, _ := json.Marshal(map[string]bool{"rebuild": rebuild})
	resp, err := s.client.Post(s.apiURL+"/migrate-all", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	var result MigrateResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode migrate-all: %w", err)
	}
	return &result, nil
}

// ExportFile represents a completed export archive.
type ExportFile struct {
	Name      string    `json:"name"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
}

// ListExports fetches the list of available export archives.
func (s *Service) ListExports() ([]ExportFile, error) {
	resp, err := s.client.Get(s.apiURL + "/exports")
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readAPIError(resp)
	}

	var files []ExportFile
	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		return nil, fmt.Errorf("decode exports: %w", err)
	}
	if files == nil {
		files = []ExportFile{}
	}
	return files, nil
}

// DeleteExport deletes a completed export archive via an async job.
func (s *Service) DeleteExport(filename string) (string, error) {
	req, err := http.NewRequest(http.MethodDelete, fmt.Sprintf("%s/exports/%s", s.apiURL, filename), nil)
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		return "", s.readAPIError(resp)
	}

	var res struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", fmt.Errorf("decode job response: %w", err)
	}
	return res.JobID, nil
}

// DownloadExport streams a completed export archive.
func (s *Service) DownloadExport(w http.ResponseWriter, filename string) error {
	resp, err := s.client.Get(fmt.Sprintf("%s/exports/%s/download", s.apiURL, filename))
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return s.readAPIError(resp)
	}

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/gzip")
	}
	cd := resp.Header.Get("Content-Disposition")
	if cd == "" {
		cd = fmt.Sprintf(`attachment; filename="%s"`, filename)
	}
	w.Header().Set("Content-Disposition", cd)
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	io.Copy(w, resp.Body)
	return nil
}
