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
	defer f.Close()

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	fw, err := w.CreateFormFile("archive", filepath.Base(archivePath))
	if err != nil {
		return "", fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(fw, f); err != nil {
		return "", fmt.Errorf("write form file: %w", err)
	}
	if newName != "" {
		w.WriteField("name", newName)
	}
	if newPort != "" {
		w.WriteField("port", newPort)
	}
	w.Close()

	resp, err := s.client.Post(s.apiURL+"/import", w.FormDataContentType(), &buf)
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
	defer f.Close()

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	fw, err := w.CreateFormFile("archive", filepath.Base(archivePath))
	if err != nil {
		return "", fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(fw, f); err != nil {
		return "", fmt.Errorf("write form file: %w", err)
	}
	w.Close()

	resp, err := s.client.Post(s.apiURL+"/import-node", w.FormDataContentType(), &buf)
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
