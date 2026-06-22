package grengo

import (
	"context"
	"encoding/json"
	"fmt"

	pb "github.com/skaia/grpc/grengo"
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
	resp, err := s.client.Stats(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var stats []ContainerStats
	if err := json.Unmarshal([]byte(resp.StatsJson), &stats); err != nil {
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
	resp, err := s.client.Storage(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var info StorageInfo
	if err := json.Unmarshal([]byte(resp.StorageJson), &info); err != nil {
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
	resp, err := s.client.GetSysInfo(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var info SysInfo
	if err := json.Unmarshal([]byte(resp.SysinfoJson), &info); err != nil {
		return nil, fmt.Errorf("decode sysinfo: %w", err)
	}
	return &info, nil
}

// HardwarePayload holds the full static+dynamic hardware payload.
// This mirrors the hardware.HardwarePayload struct in the grengo server.
type HardwarePayload struct {
	Static struct {
		CPUModel      string   `json:"cpu_model"`
		TotalCores    uint32   `json:"total_cores"`
		MemoryTotal   uint64   `json:"memory_total"`
		MemorySticks  []string `json:"memory_sticks"`
		GPUs          []string `json:"gpus"`
		StorageDrives []string `json:"storage_drives"`
	} `json:"static"`
	Dynamic struct {
		CorePercents []float64 `json:"core_percents"`
		MemoryUsed   uint64    `json:"memory_used"`
		Temps        []float64 `json:"temps"`
		DiskReads    uint64    `json:"disk_reads"`
		DiskWrites   uint64    `json:"disk_writes"`
		DiskTotal    uint64    `json:"disk_total"`
		DiskFree     uint64    `json:"disk_free"`
	} `json:"dynamic"`
}

// GetHardware retrieves the full static+dynamic hardware payload from grengo.
func (s *Service) GetHardware() (*HardwarePayload, error) {
	resp, err := s.client.GetHardware(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var payload HardwarePayload
	if err := json.Unmarshal([]byte(resp.HardwareJson), &payload); err != nil {
		return nil, fmt.Errorf("decode hardware: %w", err)
	}
	return &payload, nil
}
