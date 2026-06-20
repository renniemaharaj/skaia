package grengo

import (
	"encoding/json"
	"fmt"
	"net/http"
)

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

// SysInfo holds server system information.
type SysInfo struct {
	ServerTime    string  `json:"server_time"`
	CPUModel      string  `json:"cpu_model,omitempty"`
	CPUCores      int     `json:"cpu_cores,omitempty"`
	UptimeSeconds float64 `json:"uptime_seconds,omitempty"`
	UptimeHuman   string  `json:"uptime_human,omitempty"`
	MemTotal      string         `json:"mem_total,omitempty"`
	LoadAvg       string         `json:"load_avg,omitempty"`
	WorkerBudget  map[string]int `json:"worker_budget,omitempty"`
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
