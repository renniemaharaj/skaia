package community

import (
	"encoding/json"
	"time"
)

type Publication struct {
	ID                int64     `json:"id"`
	Kind              string    `json:"kind"`
	Slug              string    `json:"slug"`
	Title             string    `json:"title"`
	Summary           string    `json:"summary"`
	Body              string    `json:"body,omitempty"`
	PageID            int64     `json:"page_id"`
	PageSlug          string    `json:"page_slug"`
	CanManagePage     bool      `json:"can_manage_page,omitempty"`
	CanEditThread     bool      `json:"can_edit_thread,omitempty"`
	CanEdit           bool      `json:"can_edit,omitempty"`
	CanDelete         bool      `json:"can_delete,omitempty"`
	CanTransition     bool      `json:"can_transition,omitempty"`
	CanVote           bool      `json:"can_vote,omitempty"`
	CanAttend         bool      `json:"can_attend,omitempty"`
	Visibility        string    `json:"visibility"`
	PublicationStatus string    `json:"publication_status"`
	AuthorID          int64     `json:"author_id"`
	AuthorName        string    `json:"author_name"`
	CanonicalThreadID int64     `json:"canonical_thread_id"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
	Proposal          *Proposal `json:"proposal,omitempty"`
	Showcase          *Showcase `json:"showcase,omitempty"`
	Event             *Event    `json:"event,omitempty"`
}
type Proposal struct {
	State    string `json:"state"`
	Decision string `json:"decision,omitempty"`
	Score    int64  `json:"score"`
	OwnVote  int    `json:"own_vote,omitempty"`
}
type Showcase struct {
	Media   json.RawMessage `json:"media"`
	Credits string          `json:"credits"`
}
type Event struct {
	StartsAt      time.Time  `json:"starts_at"`
	EndsAt        *time.Time `json:"ends_at,omitempty"`
	Location      string     `json:"location"`
	Capacity      *int       `json:"capacity,omitempty"`
	Going         int        `json:"going"`
	OwnAttendance string     `json:"own_attendance,omitempty"`
}
type Page struct {
	Items      []Publication `json:"items"`
	NextCursor int64         `json:"next_cursor,omitempty"`
}
type CreateRequest struct {
	Kind              string          `json:"kind"`
	Slug              string          `json:"slug"`
	Title             string          `json:"title"`
	Summary           string          `json:"summary"`
	Body              string          `json:"body"`
	Visibility        string          `json:"visibility"`
	PublicationStatus string          `json:"publication_status"`
	Media             json.RawMessage `json:"media,omitempty"`
	Credits           string          `json:"credits,omitempty"`
	StartsAt          time.Time       `json:"starts_at,omitempty"`
	EndsAt            *time.Time      `json:"ends_at,omitempty"`
	Location          string          `json:"location,omitempty"`
	Capacity          *int            `json:"capacity,omitempty"`
}

type UpdateRequest struct {
	Slug              string          `json:"slug"`
	Title             string          `json:"title"`
	Summary           string          `json:"summary"`
	Visibility        string          `json:"visibility"`
	PublicationStatus string          `json:"publication_status"`
	Media             json.RawMessage `json:"media,omitempty"`
	Credits           string          `json:"credits,omitempty"`
	StartsAt          time.Time       `json:"starts_at,omitempty"`
	EndsAt            *time.Time      `json:"ends_at,omitempty"`
	Location          string          `json:"location,omitempty"`
	Capacity          *int            `json:"capacity,omitempty"`
}
