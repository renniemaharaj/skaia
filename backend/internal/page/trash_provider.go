package page

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct {
	db              database.Executor
	resource, label string
}

func NewTrashProviders(db database.Executor) []trash.Provider {
	return []trash.Provider{
		&trashProvider{db: db, resource: "page", label: "Pages"},
		&trashProvider{db: db, resource: "page_comment", label: "Page comments"},
		&trashProvider{db: db, resource: "page_allocation", label: "Page allocations"},
	}
}

func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return "home.manage" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]trash.Item, error) {
	var query string
	args := []any{actorID, includeManaged, limit, offset}
	switch p.resource {
	case "page":
		query = `SELECT id::text,COALESCE(NULLIF(title,''),slug),slug,deleted_at,deleted_by
		         FROM pages WHERE deleted_at IS NOT NULL AND ($2 OR owner_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC,id DESC LIMIT $3 OFFSET $4`
	case "page_comment":
		query = `SELECT id::text,'Comment #'||id::text,'Page #'||page_id::text,deleted_at,deleted_by
		         FROM page_comments WHERE deleted_at IS NOT NULL AND ($2 OR user_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC,id DESC LIMIT $3 OFFSET $4`
	case "page_allocation":
		if !includeManaged {
			return []trash.Item{}, nil
		}
		query = `SELECT a.id::text,'Allocation for '||COALESCE(NULLIF(u.display_name,''),u.username),
		                a.used_pages::text||' of '||a.max_pages::text||' pages',a.deleted_at,a.deleted_by
		         FROM user_page_allocations a JOIN users u ON u.id=a.user_id
		         WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC,a.id DESC LIMIT $1 OFFSET $2`
		args = []any{limit, offset}
	default:
		return nil, trash.ErrNotFound
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

func (p *trashProvider) Restore(ctx context.Context, actorID int64, includeManaged bool, rawID string) error {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 || (p.resource == "page_allocation" && !includeManaged) {
		return trash.ErrNotFound
	}
	return database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restoredID int64
		var ownerID sql.NullInt64
		switch p.resource {
		case "page":
			err = exec.QueryRowContext(ctx, `UPDATE pages SET deleted_at=NULL,deleted_by=NULL
			 WHERE id=$1 AND deleted_at IS NOT NULL AND ($3 OR owner_id=$2 OR deleted_by=$2)
			 RETURNING id,owner_id`, id, actorID, includeManaged).Scan(&restoredID, &ownerID)
		case "page_comment":
			err = exec.QueryRowContext(ctx, `UPDATE page_comments c SET deleted_at=NULL,deleted_by=NULL FROM pages p
			 WHERE c.id=$1 AND c.deleted_at IS NOT NULL AND p.id=c.page_id AND p.deleted_at IS NULL
			 AND ($3 OR c.user_id=$2 OR c.deleted_by=$2) RETURNING c.id`, id, actorID, includeManaged).Scan(&restoredID)
		case "page_allocation":
			err = exec.QueryRowContext(ctx, `UPDATE user_page_allocations SET deleted_at=NULL,deleted_by=NULL
			 WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id,user_id`, id).Scan(&restoredID, &ownerID)
		default:
			return trash.ErrNotFound
		}
		if errors.Is(err, sql.ErrNoRows) {
			if p.resource == "page_comment" {
				return p.commentRestoreFailure(ctx, exec, id, actorID, includeManaged)
			}
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		if ownerID.Valid {
			if _, err := exec.ExecContext(ctx, `UPDATE user_page_allocations SET used_pages=(SELECT COUNT(*) FROM pages
			 WHERE owner_id=$1 AND deleted_at IS NULL),updated_at=NOW() WHERE user_id=$1 AND deleted_at IS NULL`, ownerID.Int64); err != nil {
				return err
			}
		}
		_, err = exec.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)
		 VALUES ($1,$2,$3,'restore')`, actorID, p.resource, rawID)
		return err
	})
}

func (p *trashProvider) commentRestoreFailure(ctx context.Context, exec database.Executor, id, actorID int64, includeManaged bool) error {
	var authorized, parentActive bool
	err := exec.QueryRowContext(ctx, `SELECT COALESCE($3 OR c.user_id=$2 OR c.deleted_by=$2,FALSE),p.deleted_at IS NULL
	 FROM page_comments c JOIN pages p ON p.id=c.page_id WHERE c.id=$1 AND c.deleted_at IS NOT NULL`,
		id, actorID, includeManaged).Scan(&authorized, &parentActive)
	if errors.Is(err, sql.ErrNoRows) || !authorized {
		return trash.ErrNotFound
	}
	if err != nil {
		return err
	}
	if !parentActive {
		return trash.ErrConflict
	}
	return trash.ErrNotFound
}
