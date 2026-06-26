package entity

import (
	"encoding/json"
	"os"
)

type Instance struct {
	Deployment   string `json:"deployment"`
	ServerName   string `json:"server_name"`
	FrappeBranch string `json:"frappe_branch"`
	// BenchName          string         `json:"frappe_bench"`
	DropAbandonedSites bool   `json:"drop_abandoned_sites"`
	RunSitesManager    bool   `json:"run_sites_manager"`
	Sites              []Site `json:"instance_sites"`
}

// LoadInstance loads and parses instance.json
func LoadInstance(path string) (*Instance, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Instance
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.FrappeBranch == "" {
		cfg.FrappeBranch = "develop"
	}
	if cfg.Deployment == "" {
		cfg.Deployment = "develop"
	}
	return &cfg, nil
}
