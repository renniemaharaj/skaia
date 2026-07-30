package config

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
		&trashProvider{db: db, resource: "site_config", label: "Site configuration"},
		&trashProvider{db: db, resource: "page_section", label: "Landing sections"},
		&trashProvider{db: db, resource: "page_item", label: "Landing items"},
	}
}

func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return "home.manage" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, managed bool, limit, offset int) ([]trash.Item, error) {
	if !managed {
		return []trash.Item{}, nil
	}
	var query string
	switch p.resource {
	case "site_config":
		query = `SELECT key,key,'Site configuration',deleted_at,deleted_by FROM site_config
		         WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC,key LIMIT $1 OFFSET $2`
	case "page_section":
		query = `SELECT id::text,COALESCE(NULLIF(heading,''),'Section #'||id::text),section_type,deleted_at,deleted_by
		         FROM page_sections WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC,id DESC LIMIT $1 OFFSET $2`
	case "page_item":
		query = `SELECT id::text,COALESCE(NULLIF(heading,''),'Item #'||id::text),'Section #'||page_section_id::text,deleted_at,deleted_by
		         FROM page_items WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC,id DESC LIMIT $1 OFFSET $2`
	default:
		return nil, trash.ErrNotFound
	}
	rows, err := p.db.QueryContext(ctx, query, limit, offset)
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
	if !managed {
		return trash.ErrNotFound
	}
	return database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restored string
		var err error
		switch p.resource {
		case "site_config":
			err = exec.QueryRowContext(ctx,
				`UPDATE site_config SET deleted_at=NULL,deleted_by=NULL
				 WHERE key=$1 AND deleted_at IS NOT NULL RETURNING key`, rawID).Scan(&restored)
		case "page_section", "page_item":
			id, parseErr := strconv.ParseInt(rawID, 10, 64)
			if parseErr != nil || id <= 0 {
				return trash.ErrNotFound
			}
			if p.resource == "page_section" {
				err = exec.QueryRowContext(ctx,
					`UPDATE page_sections SET deleted_at=NULL,deleted_by=NULL
					 WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id::text`, id).Scan(&restored)
			} else {
				err = exec.QueryRowContext(ctx,
					`UPDATE page_items pi SET deleted_at=NULL,deleted_by=NULL
					 FROM page_sections ps
					 WHERE pi.id=$1 AND pi.deleted_at IS NOT NULL
					   AND ps.id=pi.page_section_id AND ps.deleted_at IS NULL
					 RETURNING pi.id::text`, id).Scan(&restored)
				if errors.Is(err, sql.ErrNoRows) {
					var parentActive bool
					lookupErr := exec.QueryRowContext(ctx,
						`SELECT ps.deleted_at IS NULL FROM page_items pi
						 JOIN page_sections ps ON ps.id=pi.page_section_id
						 WHERE pi.id=$1 AND pi.deleted_at IS NOT NULL`, id).Scan(&parentActive)
					if lookupErr == nil && !parentActive {
						return trash.ErrConflict
					}
				}
			}
		default:
			return trash.ErrNotFound
		}
		if errors.Is(err, sql.ErrNoRows) {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		_, err = exec.ExecContext(ctx,
			`INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)
			 VALUES ($1,$2,$3,'restore')`, actorID, p.resource, restored)
		return err
	})
}
