package user

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct {
	db       database.Executor
	resource string
	label    string
}

func NewTrashProviders(db database.Executor) []trash.Provider {
	return []trash.Provider{
		&trashProvider{db: db, resource: "user", label: "Users"},
		&trashProvider{db: db, resource: "role", label: "Roles"},
	}
}

func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return "user.manage-others" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, managed bool, limit, offset int) ([]trash.Item, error) {
	var query string
	var args []any
	if p.resource == "user" {
		query = `SELECT id::text,COALESCE(NULLIF(display_name,''),username),username,deleted_at,deleted_by
		         FROM users WHERE deleted_at IS NOT NULL AND ($2 OR id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC,id DESC LIMIT $3 OFFSET $4`
		args = []any{actorID, managed, limit, offset}
	} else {
		if !managed {
			return []trash.Item{}, nil
		}
		query = `SELECT id::text,name,COALESCE(description,'Role'),deleted_at,deleted_by
		         FROM roles WHERE deleted_at IS NOT NULL
		         ORDER BY deleted_at DESC,id DESC LIMIT $1 OFFSET $2`
		args = []any{limit, offset}
	}
	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]trash.Item, 0)
	for rows.Next() {
		var item trash.Item
		var deletedBy sql.NullInt64
		if err := rows.Scan(&item.ID, &item.Label, &item.Detail, &item.DeletedAt, &deletedBy); err != nil {
			return nil, err
		}
		item.Resource = p.resource
		if deletedBy.Valid {
			item.DeletedBy = &deletedBy.Int64
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *trashProvider) Restore(ctx context.Context, actorID int64, managed bool, rawID string) error {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return trash.ErrNotFound
	}
	if p.resource == "role" && !managed {
		return trash.ErrNotFound
	}
	var restored int64
	if p.resource == "user" {
		err = p.db.QueryRowContext(ctx,
			`UPDATE users SET deleted_at=NULL,deleted_by=NULL
			 WHERE id=$1 AND deleted_at IS NOT NULL AND ($3 OR id=$2 OR deleted_by=$2)
			 RETURNING id`, id, actorID, managed).Scan(&restored)
	} else {
		err = p.db.QueryRowContext(ctx,
			`UPDATE roles SET deleted_at=NULL,deleted_by=NULL
			 WHERE id=$1 AND deleted_at IS NOT NULL
			 RETURNING id`, id).Scan(&restored)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return trash.ErrNotFound
	}
	if err != nil {
		return err
	}
	_, err = p.db.ExecContext(ctx,
		`INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)
		 VALUES ($1,$2,$3,'restore')`, actorID, p.resource, rawID)
	return err
}
