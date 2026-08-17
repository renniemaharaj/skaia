package docs

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/lib/pq"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct {
	db              database.Executor
	resource, label string
}

func NewTrashProviders(db database.Executor) []trash.Provider {
	return []trash.Provider{
		&trashProvider{db: db, resource: "documentation", label: "Documentation"},
		&trashProvider{db: db, resource: "documentation_section", label: "Documentation sections"},
		&trashProvider{db: db, resource: "documentation_article", label: "Documentation articles"},
	}
}
func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return "docs.manage" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]trash.Item, error) {
	var query string
	switch p.resource {
	case "documentation":
		query = `SELECT id::text,title,slug,deleted_at,deleted_by FROM documentations
		WHERE deleted_at IS NOT NULL AND ($2 OR owner_id=$1 OR deleted_by=$1) ORDER BY deleted_at DESC,id DESC LIMIT $3 OFFSET $4`
	case "documentation_section":
		query = `SELECT s.id::text,s.title,d.title,s.deleted_at,s.deleted_by FROM documentation_sections s JOIN documentations d ON d.id=s.documentation_id
		WHERE s.deleted_at IS NOT NULL AND ($2 OR d.owner_id=$1 OR s.deleted_by=$1) ORDER BY s.deleted_at DESC,s.id DESC LIMIT $3 OFFSET $4`
	case "documentation_article":
		query = `SELECT a.id::text,a.title,d.title,a.deleted_at,a.deleted_by FROM documentation_articles a JOIN documentations d ON d.id=a.documentation_id
		WHERE a.deleted_at IS NOT NULL AND ($2 OR d.owner_id=$1 OR a.deleted_by=$1) ORDER BY a.deleted_at DESC,a.id DESC LIMIT $3 OFFSET $4`
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
	if err != nil || id <= 0 {
		return trash.ErrNotFound
	}
	err = database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restored int64
		switch p.resource {
		case "documentation":
			err = exec.QueryRowContext(ctx, `UPDATE documentations SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW(),revision=revision+1
			WHERE id=$1 AND deleted_at IS NOT NULL AND ($3 OR owner_id=$2 OR deleted_by=$2) RETURNING id`, id, actorID, includeManaged).Scan(&restored)
		case "documentation_section":
			err = exec.QueryRowContext(ctx, `UPDATE documentation_sections s SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW() FROM documentations d
			WHERE s.id=$1 AND s.deleted_at IS NOT NULL AND d.id=s.documentation_id AND d.deleted_at IS NULL AND ($3 OR d.owner_id=$2 OR s.deleted_by=$2) RETURNING s.id`, id, actorID, includeManaged).Scan(&restored)
		case "documentation_article":
			err = exec.QueryRowContext(ctx, `UPDATE documentation_articles a SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW(),revision=revision+1 FROM documentations d
			WHERE a.id=$1 AND a.deleted_at IS NOT NULL AND d.id=a.documentation_id AND d.deleted_at IS NULL AND ($3 OR d.owner_id=$2 OR a.deleted_by=$2)
			AND (a.section_id IS NULL OR EXISTS(SELECT 1 FROM documentation_sections s WHERE s.id=a.section_id AND s.deleted_at IS NULL)) RETURNING a.id`, id, actorID, includeManaged).Scan(&restored)
		default:
			return trash.ErrNotFound
		}
		if errors.Is(err, sql.ErrNoRows) {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		_, err = exec.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)VALUES($1,$2,$3,'restore')`, actorID, p.resource, rawID)
		return err
	})
	var pqErr *pq.Error
	if errors.As(err, &pqErr) && (pqErr.Code == "23505" || pqErr.Code == "23503") {
		return trash.ErrConflict
	}
	return err
}
