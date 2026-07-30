package notification

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct {
	db database.Executor
}

func NewTrashProvider(db database.Executor) trash.Provider {
	return &trashProvider{db: db}
}

func (p *trashProvider) Resource() string         { return "notification" }
func (p *trashProvider) Label() string            { return "Notifications" }
func (p *trashProvider) ManagePermission() string { return "" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, _ bool, limit, offset int) ([]trash.Item, error) {
	rows, err := p.db.QueryContext(
		ctx,
		`SELECT id::text, type, 'Notification', deleted_at, deleted_by
		 FROM notifications
		 WHERE user_id=$1 AND deleted_at IS NOT NULL
		 ORDER BY deleted_at DESC, id DESC LIMIT $2 OFFSET $3`,
		actorID, limit, offset,
	)
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
		item.Resource = p.Resource()
		if deletedBy.Valid {
			item.DeletedBy = &deletedBy.Int64
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *trashProvider) Restore(ctx context.Context, actorID int64, _ bool, rawID string) error {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return trash.ErrNotFound
	}
	return database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restored int64
		err := exec.QueryRowContext(
			ctx,
			`UPDATE notifications SET deleted_at=NULL, deleted_by=NULL
			 WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL
			 RETURNING id`,
			id, actorID,
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
			 VALUES ($1, 'notification', $2, 'restore')`,
			actorID, rawID,
		)
		return err
	})
}
