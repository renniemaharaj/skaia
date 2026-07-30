package forum

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct {
	db         database.Executor
	resource   string
	label      string
	permission string
}

func NewTrashProviders(db database.Executor) []trash.Provider {
	return []trash.Provider{
		&trashProvider{db: db, resource: "forum_category", label: "Forum categories", permission: "forum.category-delete"},
		&trashProvider{db: db, resource: "forum_thread", label: "Forum threads", permission: "forum.thread-delete"},
		&trashProvider{db: db, resource: "thread_comment", label: "Thread comments", permission: "forum.thread-comment-delete"},
	}
}

func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return p.permission }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]trash.Item, error) {
	var query string
	switch p.resource {
	case "forum_category":
		query = `SELECT id::text, name, description, deleted_at, deleted_by
		         FROM forum_categories
		         WHERE deleted_at IS NOT NULL AND ($2 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "forum_thread":
		query = `SELECT id::text, title, 'Forum thread', deleted_at, deleted_by
		         FROM forum_threads
		         WHERE deleted_at IS NOT NULL AND ($2 OR user_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "thread_comment":
		query = `SELECT id::text, 'Comment #' || id::text, 'Thread #' || thread_id::text,
		                deleted_at, deleted_by
		         FROM thread_comments
		         WHERE deleted_at IS NOT NULL AND ($2 OR user_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	default:
		return nil, trash.ErrNotFound
	}

	rows, err := p.db.QueryContext(ctx, query, actorID, includeManaged, limit, offset)
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
		item.Resource = p.resource
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
		var query string
		switch p.resource {
		case "forum_category":
			query = `UPDATE forum_categories
			         SET deleted_at=NULL, deleted_by=NULL
			         WHERE id=$1 AND deleted_at IS NOT NULL
			           AND ($3 OR deleted_by=$2)
			         RETURNING id`
		case "forum_thread":
			query = `UPDATE forum_threads ft
			         SET deleted_at=NULL, deleted_by=NULL
			         FROM forum_categories fc
			         WHERE ft.id=$1 AND ft.deleted_at IS NOT NULL
			           AND fc.id=ft.category_id AND fc.deleted_at IS NULL
			           AND ($3 OR ft.user_id=$2 OR ft.deleted_by=$2)
			         RETURNING ft.id`
		case "thread_comment":
			query = `UPDATE thread_comments tc
			         SET deleted_at=NULL, deleted_by=NULL
			         FROM forum_threads ft
			         JOIN forum_categories fc
			           ON fc.id=ft.category_id AND fc.deleted_at IS NULL
			         WHERE tc.id=$1 AND tc.deleted_at IS NOT NULL
			           AND ft.id=tc.thread_id AND ft.deleted_at IS NULL
			           AND ($3 OR tc.user_id=$2 OR tc.deleted_by=$2)
			         RETURNING tc.id`
		default:
			return trash.ErrNotFound
		}

		var restoredID int64
		err := exec.QueryRowContext(ctx, query, id, actorID, includeManaged).Scan(&restoredID)
		if errors.Is(err, sql.ErrNoRows) {
			return p.restoreFailure(ctx, exec, id, actorID, includeManaged)
		}
		if err != nil {
			return err
		}

		if p.resource == "thread_comment" {
			if _, err := exec.ExecContext(
				ctx,
				`UPDATE forum_threads
				 SET reply_count=reply_count + 1
				 WHERE id=(SELECT thread_id FROM thread_comments WHERE id=$1)`,
				id,
			); err != nil {
				return err
			}
		}
		_, err = exec.ExecContext(
			ctx,
			`INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
			 VALUES ($1, $2, $3, 'restore')`,
			actorID, p.resource, rawID,
		)
		return err
	})
}

func (p *trashProvider) restoreFailure(ctx context.Context, exec database.Executor, id, actorID int64, includeManaged bool) error {
	var exists bool
	var authorized bool
	var parentActive bool
	switch p.resource {
	case "forum_category":
		err := exec.QueryRowContext(
			ctx,
			`SELECT TRUE, COALESCE($3 OR deleted_by=$2, FALSE), TRUE
			 FROM forum_categories WHERE id=$1 AND deleted_at IS NOT NULL`,
			id, actorID, includeManaged,
		).Scan(&exists, &authorized, &parentActive)
		if errors.Is(err, sql.ErrNoRows) {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
	case "forum_thread":
		err := exec.QueryRowContext(
			ctx,
			`SELECT TRUE,
			        COALESCE($3 OR ft.user_id=$2 OR ft.deleted_by=$2, FALSE),
			        (fc.deleted_at IS NULL)
			 FROM forum_threads ft
			 JOIN forum_categories fc ON fc.id=ft.category_id
			 WHERE ft.id=$1 AND ft.deleted_at IS NOT NULL`,
			id, actorID, includeManaged,
		).Scan(&exists, &authorized, &parentActive)
		if errors.Is(err, sql.ErrNoRows) {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
	case "thread_comment":
		err := exec.QueryRowContext(
			ctx,
			`SELECT TRUE,
			        COALESCE($3 OR tc.user_id=$2 OR tc.deleted_by=$2, FALSE),
			        (ft.deleted_at IS NULL AND fc.deleted_at IS NULL)
			 FROM thread_comments tc
			 JOIN forum_threads ft ON ft.id=tc.thread_id
			 JOIN forum_categories fc ON fc.id=ft.category_id
			 WHERE tc.id=$1 AND tc.deleted_at IS NOT NULL`,
			id, actorID, includeManaged,
		).Scan(&exists, &authorized, &parentActive)
		if errors.Is(err, sql.ErrNoRows) {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
	}
	if !exists {
		return trash.ErrNotFound
	}
	if !authorized {
		// Deliberately collapse authorization failures to not-found so callers
		// cannot enumerate tombstones they are not allowed to see.
		return trash.ErrNotFound
	}
	if !parentActive {
		return trash.ErrConflict
	}
	return trash.ErrNotFound
}
