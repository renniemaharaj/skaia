package models

import (
	"encoding/json"
	"time"
)

// DataSource holds a named TypeScript code snippet that can be evaluated
// to produce a JSON array of items for derived page sections.
type DataSource struct {
	ID          int64           `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Code        string          `json:"code"`
	Files       json.RawMessage `json:"files"`
	EnvData     string          `json:"env_data,omitempty"`
	CacheTTL    int             `json:"cache_ttl"`
	CreatedBy   *int64          `json:"created_by,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// CustomSection is the legacy name for a reusable data-bound section preset.
// Both section_type and preset_type are exposed during the route/type alias
// compatibility window.
type CustomSection struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DataSourceID int64     `json:"datasource_id"`
	SectionType  string    `json:"section_type"`
	PresetType   string    `json:"preset_type,omitempty"`
	Config       string    `json:"config"`
	CreatedBy    *int64    `json:"created_by,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SectionPreset is the preferred name for the reusable custom-section model.
type SectionPreset = CustomSection
