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

// SiteInfo describes a single client visible to the dashboard.
type SiteInfo struct {
	Name     string   `json:"name"`
	Port     string   `json:"port"`
	Status   string   `json:"status"`
	Running  bool     `json:"running"`
	Armed    bool     `json:"armed"`
	Domains  []string `json:"domains"`
	DBName   string   `json:"db_name"`
	Features string   `json:"features"`
}

// CreateSiteParams holds everything needed to provision a new client.
type CreateSiteParams struct {
	Name           string   `json:"name"`
	Port           string   `json:"port"`
	Domains        []string `json:"domains"`
	DBName         string   `json:"db_name"`
	AdminPassword  string   `json:"admin_password"`
	AdminEmail     string   `json:"admin_email"`
	SessionTimeout string   `json:"session_timeout"`
	Environment    string   `json:"environment"`
	Features       string   `json:"features"`
}

// Service communicates with the internal grengo API server over HTTP.
type Service struct {
	apiURL string
	client *http.Client
}

// NewService creates a grengo service that talks to the internal API.
func NewService(apiURL string) *Service {
	return &Service{
		apiURL: apiURL,
		client: &http.Client{Timeout: 120 * time.Second},
	}
}

// ---------------------------------------------------------------------------
// Passcode
// ---------------------------------------------------------------------------

// PasscodeConfigured checks with the grengo API whether a passcode is set.
func (s *Service) PasscodeConfigured() bool {
	resp, err := s.client.Get(s.apiURL + "/passcode/status")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var result struct {
		Configured bool `json:"configured"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Configured
}

// VerifyPasscode checks a (p1, p2) pair via the grengo API.
func (s *Service) VerifyPasscode(p1, p2 string) bool {
	body, _ := json.Marshal(map[string]string{"p1": p1, "p2": p2})
	resp, err := s.client.Post(s.apiURL+"/verify-passcode", "application/json", bytes.NewReader(body))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var result struct {
		Valid bool `json:"valid"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Valid
}

// ---------------------------------------------------------------------------
// Performance stats
// ---------------------------------------------------------------------------

// ContainerStats holds metrics for a single container.
type ContainerStats struct {
	Name     string  `json:"name"`
	CPU      float64 `json:"cpu_percent"`
	MemUsage string  `json:"mem_usage"`
	MemLimit string  `json:"mem_limit"`
	MemPct   float64 `json:"mem_percent"`
	NetIO    string  `json:"net_io"`
	BlockIO  string  `json:"block_io"`
	PIDs     int     `json:"pids"`
}

// Stats retrieves Docker container stats from the grengo API.
func (s *Service) Stats() ([]ContainerStats, error) {
	resp, err := s.client.Get(s.apiURL + "/stats")
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readAPIError(resp)
	}
	var stats []ContainerStats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, fmt.Errorf("decode stats: %w", err)
	}
	if stats == nil {
		stats = []ContainerStats{}
	}
	return stats, nil
}

// ---------------------------------------------------------------------------
// Site listing
// ---------------------------------------------------------------------------

// ListSites retrieves all sites from the grengo API.
func (s *Service) ListSites() ([]SiteInfo, error) {
	resp, err := s.client.Get(s.apiURL + "/sites")
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readAPIError(resp)
	}
	var sites []SiteInfo
	if err := json.NewDecoder(resp.Body).Decode(&sites); err != nil {
		return nil, fmt.Errorf("decode sites: %w", err)
	}
	if sites == nil {
		sites = []SiteInfo{}
	}
	return sites, nil
}

// ---------------------------------------------------------------------------
// Generic exec helper
// ---------------------------------------------------------------------------

type execResponse struct {
	OK       bool   `json:"ok"`
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error"`
}

func (s *Service) exec(command string, args ...string) (*execResponse, error) {
	body, _ := json.Marshal(map[string]any{
		"command": command,
		"args":    args,
	})
	resp, err := s.client.Post(s.apiURL+"/exec", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	var result execResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode exec response: %w", err)
	}
	if result.Error != "" {
		return nil, fmt.Errorf("grengo API: %s", result.Error)
	}
	return &result, nil
}

func (s *Service) execOK(command string, args ...string) error {
	result, err := s.exec(command, args...)
	if err != nil {
		return err
	}
	if !result.OK {
		return fmt.Errorf("grengo %s failed (exit %d): %s", command, result.ExitCode, result.Output)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Site creation
// ---------------------------------------------------------------------------

// CreateSite provisions a new client via the grengo API.
func (s *Service) CreateSite(p CreateSiteParams) error {
	if p.Name == "" {
		return fmt.Errorf("name is required")
	}

	args := []string{p.Name}
	for _, d := range p.Domains {
		args = append(args, "--domain", d)
	}
	if p.Port != "" {
		args = append(args, "--port", p.Port)
	}

	return s.execOK("new", args...)
}

// ---------------------------------------------------------------------------
// Site lifecycle
// ---------------------------------------------------------------------------

// DeleteSite removes a client via the grengo API.
func (s *Service) DeleteSite(name string) error { return s.execOK("remove", name) }

// StartSite starts a client backend via the grengo API.
func (s *Service) StartSite(name string) error { return s.execOK("start", name) }

// StopSite stops a client backend via the grengo API.
func (s *Service) StopSite(name string) error { return s.execOK("stop", name) }

// EnableSite re-enables a disabled client via the grengo API.
func (s *Service) EnableSite(name string) error { return s.execOK("enable", name) }

// DisableSite disables a client and stops its backend via the grengo API.
func (s *Service) DisableSite(name string) error { return s.execOK("disable", name) }

// ArmSite arms a client via the grengo API.
func (s *Service) ArmSite(name string) error {
	resp, err := s.client.Post(fmt.Sprintf("%s/sites/%s/arm", s.apiURL, name), "application/json", nil)
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return s.readAPIError(resp)
	}
	return nil
}

// DisarmSite disarms a client via the grengo API.
func (s *Service) DisarmSite(name string) error {
	resp, err := s.client.Post(fmt.Sprintf("%s/sites/%s/disarm", s.apiURL, name), "application/json", nil)
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return s.readAPIError(resp)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

// ExportSite downloads the archive from the grengo API and returns a temp file path.
func (s *Service) ExportSite(name string) (string, error) {
	resp, err := s.client.Get(fmt.Sprintf("%s/export/%s", s.apiURL, name))
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", s.readAPIError(resp)
	}

	tmpFile, err := os.CreateTemp("", "grengo-export-*.tar.gz")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("download export: %w", err)
	}
	tmpFile.Close()
	return tmpFile.Name(), nil
}

// ImportSite uploads an archive to the grengo API for import.
func (s *Service) ImportSite(archivePath, newName, newPort string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	fw, err := w.CreateFormFile("archive", filepath.Base(archivePath))
	if err != nil {
		return fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(fw, f); err != nil {
		return fmt.Errorf("write form file: %w", err)
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
		return fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return s.readAPIError(resp)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Compose orchestration
// ---------------------------------------------------------------------------

// ComposeUp starts all infrastructure and enabled backends via the grengo API.
func (s *Service) ComposeUp(build bool) error {
	args := []string{"up"}
	if build {
		args = append(args, "--build")
	}
	return s.execOK("compose", args...)
}

// ComposeDown stops all client backends and shared infrastructure.
func (s *Service) ComposeDown() error {
	return s.execOK("compose", "down")
}

// ---------------------------------------------------------------------------
// Env file management
// ---------------------------------------------------------------------------

// GetSiteEnv retrieves the raw .env file content for a site.
func (s *Service) GetSiteEnv(name string) (string, error) {
	resp, err := s.client.Get(fmt.Sprintf("%s/env/%s", s.apiURL, name))
	if err != nil {
		return "", fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", s.readAPIError(resp)
	}
	var result struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode env: %w", err)
	}
	return result.Content, nil
}

// UpdateSiteEnv overwrites the .env file for a site.
func (s *Service) UpdateSiteEnv(name, content string) error {
	body, _ := json.Marshal(map[string]string{"content": content})
	req, err := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/env/%s", s.apiURL, name), bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return s.readAPIError(resp)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (s *Service) readAPIError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)
	var errResp struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(body, &errResp) == nil && errResp.Error != "" {
		return fmt.Errorf("grengo API (%d): %s", resp.StatusCode, errResp.Error)
	}
	return fmt.Errorf("grengo API (%d): %s", resp.StatusCode, string(body))
}
