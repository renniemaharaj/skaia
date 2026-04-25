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

// CustomSection is a reusable data-bound visualization (like a Superset chart).
// It pairs a DataSource with a section type (cards, stat_cards, table, etc.).
type CustomSection struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	DataSourceID int64     `json:"datasource_id"`
	SectionType  string    `json:"section_type"`
	Config       string    `json:"config"`
	CreatedBy    *int64    `json:"created_by,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
