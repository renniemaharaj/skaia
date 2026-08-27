package grengo

import (
	"context"
	"encoding/json"
	"fmt"

	pb "github.com/skaia/grpc/grengo"
)

// ContainerStats is the narrow internal projection used by deployment status.
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

// Stats retrieves the bounded container projection needed by provisioning.
func (s *Service) Stats() ([]ContainerStats, error) {
	response, err := s.client.Stats(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		return nil, fmt.Errorf("grengo API: %w", err)
	}
	var stats []ContainerStats
	if err := json.Unmarshal([]byte(response.StatsJson), &stats); err != nil {
		return nil, fmt.Errorf("decode stats: %w", err)
	}
	if stats == nil {
		stats = []ContainerStats{}
	}
	return stats, nil
}
