package trash

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound  = errors.New("trashed resource not found")
	ErrForbidden = errors.New("trash operation forbidden")
	ErrConflict  = errors.New("trash restore conflict")
)

// Item is the deliberately small, content-free projection shared by the trash
// directory. Domain providers must not place private bodies or secrets here.
type Item struct {
	Resource  string    `json:"resource"`
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	Detail    string    `json:"detail,omitempty"`
	DeletedAt time.Time `json:"deleted_at"`
	DeletedBy *int64    `json:"deleted_by,omitempty"`
}

type Group struct {
	Resource string `json:"resource"`
	Label    string `json:"label"`
	Items    []Item `json:"items"`
	HasMore  bool   `json:"has_more"`
}

// Provider is implemented inside each resource domain. The aggregator never
// queries application tables directly and never accepts caller-selected scope.
type Provider interface {
	Resource() string
	Label() string
	ManagePermission() string
	ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]Item, error)
	Restore(ctx context.Context, actorID int64, includeManaged bool, id string) error
}

type Authorizer interface {
	HasPermission(userID int64, permission string) (bool, error)
}
