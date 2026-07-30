package datasource

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct{ db database.Executor }

func NewTrashProvider(db database.Executor) trash.Provider { return &trashProvider{db: db} }
func (p *trashProvider) Resource() string                  { return "data_source" }
func (p *trashProvider) Label() string                     { return "Data sources" }
func (p *trashProvider) ManagePermission() string          { return "home.manage" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]trash.Item, error) {
	rows, err := p.db.QueryContext(
		ctx,
		`SELECT id::text, name, description, deleted_at, deleted_by
		 FROM data_sources
		 WHERE deleted_at IS NOT NULL
		   AND ($2 OR created_by=$1 OR deleted_by=$1)
		 ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`,
		actorID, includeManaged, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]trash.Item, 0)
	for rows.Next() {
		var item trash.Item
		var detail sql.NullString
		var deletedBy sql.NullInt64
		if err := rows.Scan(&item.ID, &item.Label, &detail, &item.DeletedAt, &deletedBy); err != nil {
			return nil, err
		}
		item.Resource = p.Resource()
		if detail.Valid {
			item.Detail = detail.String
		}
		if deletedBy.Valid {
			item.DeletedBy = &deletedBy.Int64
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *trashProvider) Restore(ctx context.Context, actorID int64, includeManaged bool, rawID string) error {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return trash.ErrNotFound
	}
	return database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restored int64
		err := exec.QueryRowContext(
			ctx,
			`UPDATE data_sources SET deleted_at=NULL, deleted_by=NULL
			 WHERE id=$1 AND deleted_at IS NOT NULL
			   AND ($3 OR created_by=$2 OR deleted_by=$2)
			 RETURNING id`,
			id, actorID, includeManaged,
		).Scan(&restored)
		if errors.Is(err, sql.ErrNoRows) {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		_, err = exec.ExecContext(
			ctx,
			`INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
			 VALUES ($1, 'data_source', $2, 'restore')`,
			actorID, rawID,
		)
		return err
	})
}
