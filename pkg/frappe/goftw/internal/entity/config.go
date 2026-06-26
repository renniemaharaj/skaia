package entity

import (
	"encoding/json"
	"os"
)

type Common_Site_Config struct {
	RedisQueue    string `json:"redis_queue"`
	RedisCache    string `json:"redis_cache"`
	RedisSocketIO string `json:"redis_socketio"`
}

// LoadCommonSitesConfig loads and parses common_site_config.json
func LoadCommonSitesConfig(path string) (*Common_Site_Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Common_Site_Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
