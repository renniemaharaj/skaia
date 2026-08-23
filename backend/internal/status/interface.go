package status

import (
	"context"
	"time"
)

type Repository interface {
	ListPublic(ctx context.Context, limit int) ([]Incident, error)
	Create(ctx context.Context, actorID int64, incident Incident) (*Incident, error)
	Update(ctx context.Context, actorID, incidentID int64, incident Incident) (*Incident, error)
}

type OperatorPolicy interface {
	RequireStatusOperator(actorID int64) error
}

type Clock func() time.Time
