package models

import (
	"encoding/json"
	"time"
)

type AppBlueprint struct {
	ID                int64           `json:"id"`
	Name              string          `json:"name"`
	Description       string          `json:"description"`
	SupportedVersions json.RawMessage `json:"supported_versions"`
	ConfigSchema      json.RawMessage `json:"config_schema"`
	IsActive          bool            `json:"is_active"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type ProvisionedInstance struct {
	ID            int64           `json:"id"`
	ClientID      int64           `json:"client_id"`
	BlueprintID   int64           `json:"blueprint_id"`
	VersionTag    string          `json:"version_tag"`
	Status        string          `json:"status"`
	ConfigPayload json.RawMessage `json:"config_payload"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}
