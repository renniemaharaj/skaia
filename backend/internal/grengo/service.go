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
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/skaia/backend/internal/ws"
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
	apiURL   string
	client   *http.Client
	passcode string // "p1:p2" for X-Grengo-Passcode header; empty = no auth
	hub      *ws.Hub

	wsConn   *websocket.Conn
	wsConnMu sync.Mutex
}

// NewService creates a grengo service that talks to the internal API.
func NewService(apiURL string, hub *ws.Hub) *Service {
	return &Service{
		apiURL: apiURL,
		client: &http.Client{Timeout: 120 * time.Second},
		hub:    hub,
	}
}

// WithPasscode returns a new Service that authenticates with the given passcode pair.
// The original Service is not modified.
func (s *Service) WithPasscode(p1, p2 string) *Service {
	passcode := p1 + ":" + p2
	return &Service{
		apiURL:   s.apiURL,
		passcode: passcode,
		hub:      s.hub,
		client: &http.Client{
			Timeout: 120 * time.Second,
			Transport: &passcodeTransport{
				base:     http.DefaultTransport,
				passcode: passcode,
			},
		},
	}
}

// passcodeTransport injects X-Grengo-Passcode on every outgoing request.
type passcodeTransport struct {
	base     http.RoundTripper
	passcode string
}

func (t *passcodeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.passcode != "" {
		req = req.Clone(req.Context())
		req.Header.Set("X-Grengo-Passcode", t.passcode)
	}
	return t.base.RoundTrip(req)
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
// Storage info
// ---------------------------------------------------------------------------

// SiteStorageInfo holds storage usage for a single site.
type SiteStorageInfo struct {
	Name      string `json:"name"`
	Used      int64  `json:"used"`
	UsedHuman string `json:"used_human"`
}

// StorageInfo holds upload storage metrics for all sites.
type StorageInfo struct {
	Sites      []SiteStorageInfo `json:"sites"`
	TotalUsed  int64             `json:"total_used"`
	TotalLimit int64             `json:"total_limit"`
	TotalPct   float64           `json:"total_percent"`
	TotalHuman string            `json:"total_used_human"`
	LimitHuman string            `json:"total_limit_human"`
}

// Storage retrieves upload storage usage from the grengo API.
func (s *Service) Storage() (*StorageInfo, error) {
	resp, err := s.client.Get(s.apiURL + "/storage")
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readAPIError(resp)
	}
	var info StorageInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode storage: %w", err)
	}
	return &info, nil
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
// System info
// ---------------------------------------------------------------------------

// SysInfo holds server system information.
type SysInfo struct {
	ServerTime    string  `json:"server_time"`
	CPUModel      string  `json:"cpu_model,omitempty"`
	CPUCores      int     `json:"cpu_cores,omitempty"`
	UptimeSeconds float64 `json:"uptime_seconds,omitempty"`
	UptimeHuman   string  `json:"uptime_human,omitempty"`
	MemTotal      string  `json:"mem_total,omitempty"`
	LoadAvg       string  `json:"load_avg,omitempty"`
}

// GetSysInfo retrieves server system information from the grengo API.
func (s *Service) GetSysInfo() (*SysInfo, error) {
	resp, err := s.client.Get(s.apiURL + "/sysinfo")
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readAPIError(resp)
	}
	var info SysInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode sysinfo: %w", err)
	}
	return &info, nil
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Node Export / Import
// ---------------------------------------------------------------------------

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

// WatchJobs connects to the grengo WebSocket and broadcasts job updates to the frontend hub.
func (s *Service) WatchJobs() {
	wsURL := strings.Replace(s.apiURL, "http://", "ws://", 1) + "/ws"

	for {
		headers := make(http.Header)
		if s.passcode != "" {
			headers.Set("X-Grengo-Passcode", s.passcode)
		}
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
		if err != nil {
			fmt.Printf("grengo ws: failed to connect to %s: %v, retrying in 5s...\n", wsURL, err)
			time.Sleep(5 * time.Second)
			continue
		}
		fmt.Printf("grengo ws: connected to %s\n", wsURL)

		s.wsConnMu.Lock()
		s.wsConn = conn
		s.wsConnMu.Unlock()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				fmt.Printf("grengo ws: disconnected: %v\n", err)
				conn.Close()
				s.wsConnMu.Lock()
				if s.wsConn == conn {
					s.wsConn = nil
				}
				s.wsConnMu.Unlock()
				break
			}

			var parsed struct {
				Type    string          `json:"type"`
				Payload json.RawMessage `json:"payload"`
			}
			json.Unmarshal(msg, &parsed)
			
			msgType := ws.GrengoJobUpdate
			if parsed.Type == "stats_update" {
				msgType = ws.GrengoStatsUpdate
			} else if parsed.Type == "storage_update" {
				msgType = ws.GrengoStorageUpdate
			}

			// Broadcast only the payload to frontend clients (not the full grengo envelope)
			broadcastPayload := parsed.Payload
			if broadcastPayload == nil {
				broadcastPayload = json.RawMessage(msg)
			}

			if s.hub != nil {
				s.hub.Broadcast(&ws.Message{
					Type:    msgType,
					Payload: broadcastPayload,
				})
			}
		}

		time.Sleep(5 * time.Second)
	}
}

// SendAction sends a command to grengo via the established WebSocket connection.
func (s *Service) SendAction(action []byte) {
	s.wsConnMu.Lock()
	defer s.wsConnMu.Unlock()
	if s.wsConn != nil {
		_ = s.wsConn.WriteMessage(websocket.TextMessage, action)
	}
}

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
