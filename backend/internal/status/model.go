package status

import "time"

type State string

const (
	StateOperational State = "operational"
	StateDegraded    State = "degraded"
	StateUnavailable State = "unavailable"
	StateStale       State = "stale"
)

type Component struct {
	Name       string        `json:"name"`
	State      State         `json:"state"`
	Required   bool          `json:"required"`
	CheckedAt  time.Time     `json:"checked_at"`
	Latency    time.Duration `json:"-"`
	ReasonCode string        `json:"-"`
}

type Incident struct {
	ID         int64      `json:"id"`
	Title      string     `json:"title"`
	Summary    string     `json:"summary"`
	State      string     `json:"state"`
	Severity   string     `json:"severity"`
	Component  string     `json:"component"`
	StartedAt  time.Time  `json:"started_at"`
	ResolvedAt *time.Time `json:"resolved_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type PublicSnapshot struct {
	State      State       `json:"state"`
	Components []Component `json:"components"`
	Incidents  []Incident  `json:"incidents"`
	UpdatedAt  time.Time   `json:"updated_at"`
	Delayed    bool        `json:"delayed"`
}

type Readiness struct {
	State      State       `json:"state"`
	Components []Component `json:"components"`
	UpdatedAt  time.Time   `json:"updated_at"`
}

type DiagnosticComponent struct {
	Name       string    `json:"name"`
	State      State     `json:"state"`
	Required   bool      `json:"required"`
	CheckedAt  time.Time `json:"checked_at"`
	LatencyMS  int64     `json:"latency_ms"`
	ReasonCode string    `json:"reason_code,omitempty"`
}

type Diagnostics struct {
	State      State                 `json:"state"`
	Components []DiagnosticComponent `json:"components"`
	UpdatedAt  time.Time             `json:"updated_at"`
	Runtime    RuntimeMetrics        `json:"runtime"`
}

type RuntimeMetrics struct {
	DBOpenConnections            int   `json:"db_open_connections"`
	DBInUseConnections           int   `json:"db_in_use_connections"`
	DBMaxOpenConnections         int   `json:"db_max_open_connections"`
	DBWaitCount                  int64 `json:"db_wait_count"`
	FulfilmentQueueReady         int64 `json:"fulfilment_queue_ready"`
	FulfilmentQueueOldestSeconds int64 `json:"fulfilment_queue_oldest_seconds"`
}
