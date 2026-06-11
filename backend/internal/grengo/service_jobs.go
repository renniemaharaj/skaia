package grengo

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// JobStatus represents the state of an async export job.
type JobStatus struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Status    string    `json:"status"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// GetJob returns the status of a background job.
func (s *Service) GetJob(id string) (*JobStatus, error) {
	resp, err := s.client.Get(fmt.Sprintf("%s/jobs/%s", s.apiURL, id))
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readAPIError(resp)
	}

	var j JobStatus
	if err := json.NewDecoder(resp.Body).Decode(&j); err != nil {
		return nil, fmt.Errorf("decode job: %w", err)
	}
	return &j, nil
}

// DownloadJob streams the completed job archive from the grengo API and returns a temp file path.
func (s *Service) DownloadJob(id string) (string, error) {
	resp, err := s.client.Get(fmt.Sprintf("%s/jobs/%s/download", s.apiURL, id))
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", s.readAPIError(resp)
	}

	tmpFile, err := os.CreateTemp("", "grengo-job-*.tar.gz")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("download job archive: %w", err)
	}
	tmpFile.Close()
	return tmpFile.Name(), nil
}
