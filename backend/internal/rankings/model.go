package rankings

import "time"

type Dataset struct {
	ID          int64  `json:"id"`
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
	MetricLabel string `json:"metric_label"`
	Direction   string `json:"direction"`
	TieRule     string `json:"tie_rule"`
	Visibility  string `json:"visibility"`
	Enabled     bool   `json:"enabled"`
}
type Season struct {
	ID        int64      `json:"id"`
	DatasetID int64      `json:"dataset_id"`
	Key       string     `json:"key"`
	Name      string     `json:"name"`
	StartsAt  time.Time  `json:"starts_at"`
	EndsAt    *time.Time `json:"ends_at,omitempty"`
	ClosedAt  *time.Time `json:"closed_at,omitempty"`
}
type Entry struct {
	ID          int64     `json:"id"`
	Rank        int64     `json:"rank"`
	SubjectType string    `json:"subject_type"`
	SubjectKey  string    `json:"subject_key,omitempty"`
	DisplayName string    `json:"display_name"`
	Score       string    `json:"score"`
	UpdatedAt   time.Time `json:"updated_at"`
}
type Standings struct {
	Dataset    Dataset `json:"dataset"`
	Season     Season  `json:"season"`
	Entries    []Entry `json:"entries"`
	NextCursor string  `json:"next_cursor,omitempty"`
}
type CreateDatasetRequest struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
	MetricLabel string `json:"metric_label"`
	Direction   string `json:"direction"`
	TieRule     string `json:"tie_rule"`
	Visibility  string `json:"visibility"`
	Enabled     bool   `json:"enabled"`
}
type CreateSeasonRequest struct {
	Key      string     `json:"key"`
	Name     string     `json:"name"`
	StartsAt time.Time  `json:"starts_at"`
	EndsAt   *time.Time `json:"ends_at,omitempty"`
}
type IngestRequest struct {
	EventID     string `json:"event_id"`
	SeasonKey   string `json:"season_key"`
	SubjectType string `json:"subject_type"`
	SubjectKey  string `json:"subject_key"`
	DisplayName string `json:"display_name"`
	Public      bool   `json:"public"`
	Mode        string `json:"mode"`
	Value       string `json:"value"`
}
