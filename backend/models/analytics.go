package models

import (
	"encoding/json"
	"time"
)

// ResourceView represents a recorded view of a page or thread.
type ResourceView struct {
	ID         int64     `json:"id"`
	Resource   string    `json:"resource"`
	ResourceID int64     `json:"resource_id"`
	UserID     *int64    `json:"user_id,omitempty"`
	IP         string    `json:"ip"`
	CreatedAt  time.Time `json:"created_at"`
}

// VisitorEntry is a single row in the recent-visitors list, enriched with user info.
type VisitorEntry struct {
	ID          int64     `json:"id"`
	IP          string    `json:"ip"`
	UserID      *int64    `json:"user_id,omitempty"`
	Username    *string   `json:"username,omitempty"`
	DisplayName *string   `json:"display_name,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// ViewStat is a single data point in an aggregated view time-series.
type ViewStat struct {
	Date        string `json:"date"`
	Views       int    `json:"views"`
	UniqueIPs   int    `json:"unique_ips"`
	UniqueUsers int    `json:"unique_users"`
}

// Event represents an audit log entry for any user or system activity.
type Event struct {
	ID         int64           `json:"id"`
	UserID     *int64          `json:"user_id,omitempty"`
	Username   string          `json:"username,omitempty"`
	AvatarURL  string          `json:"avatar_url,omitempty"`
	Activity   string          `json:"activity"`
	Resource   string          `json:"resource,omitempty"`
	ResourceID *int64          `json:"resource_id,omitempty"`
	Meta       json.RawMessage `json:"meta,omitempty"`
	IP         string          `json:"-"`
	CreatedAt  time.Time       `json:"created_at"`
}
