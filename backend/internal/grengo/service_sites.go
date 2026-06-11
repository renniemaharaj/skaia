package grengo

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
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
