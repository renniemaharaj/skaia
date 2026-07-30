package page

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

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
		&trashProvider{db: db, resource: "page", label: "Pages"},
		&trashProvider{db: db, resource: "page_comment", label: "Page comments"},
		&trashProvider{db: db, resource: "page_allocation", label: "Page allocations"},
		&trashProvider{db: db, resource: "page_section_instance", label: "Page sections"},
		&trashProvider{db: db, resource: "page_section_item", label: "Page section items"},
		&trashProvider{db: db, resource: "page_theme_token", label: "Page theme tokens"},
		&trashProvider{db: db, resource: "page_response", label: "Page responses"},
	}
}

func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return "home.manage" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]trash.Item, error) {
	var query string
	var args []any
	switch p.resource {
	case "page":
		query = `SELECT id::text, COALESCE(NULLIF(title, ''), slug), slug,
		                deleted_at, deleted_by
		         FROM pages
		         WHERE deleted_at IS NOT NULL
		           AND ($2 OR owner_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "page_comment":
		query = `SELECT id::text, 'Comment #' || id::text,
		                'Page #' || page_id::text, deleted_at, deleted_by
		         FROM page_comments
		         WHERE deleted_at IS NOT NULL
		           AND ($2 OR user_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC, id DESC LIMIT $3 OFFSET $4`
	case "page_allocation":
		if !includeManaged {
			return []trash.Item{}, nil
		}
		query = `SELECT a.id::text,'Allocation for '||COALESCE(NULLIF(u.display_name,''),u.username),
		                a.used_pages::text||' of '||a.max_pages::text||' pages',
		                a.deleted_at,a.deleted_by
		         FROM user_page_allocations a JOIN users u ON u.id=a.user_id
		         WHERE a.deleted_at IS NOT NULL
		         ORDER BY a.deleted_at DESC,a.id DESC LIMIT $1 OFFSET $2`
		args = []any{limit, offset}
	case "page_section_instance":
		query = `SELECT s.id::text,COALESCE(NULLIF(s.heading,''),'Section #'||s.id::text),
		                COALESCE(NULLIF(p.title,''),p.slug),s.deleted_at,s.deleted_by
		         FROM page_section_instances s JOIN pages p ON p.id=s.page_id
		         WHERE s.deleted_at IS NOT NULL AND ($2 OR p.owner_id=$1 OR s.deleted_by=$1)
		         ORDER BY s.deleted_at DESC,s.id DESC LIMIT $3 OFFSET $4`
	case "page_section_item":
		query = `SELECT i.id::text,COALESCE(NULLIF(i.heading,''),'Item #'||i.id::text),
		                COALESCE(NULLIF(p.title,''),p.slug),i.deleted_at,i.deleted_by
		         FROM page_section_instance_items i
		         JOIN page_section_instances s ON s.id=i.section_id
		         JOIN pages p ON p.id=s.page_id
		         WHERE i.deleted_at IS NOT NULL AND ($2 OR p.owner_id=$1 OR i.deleted_by=$1)
		         ORDER BY i.deleted_at DESC,i.id DESC LIMIT $3 OFFSET $4`
	case "page_theme_token":
		query = `SELECT t.id::text,t.label,COALESCE(NULLIF(p.title,''),p.slug),t.deleted_at,t.deleted_by
		         FROM page_theme_tokens t JOIN pages p ON p.id=t.page_id
		         WHERE t.deleted_at IS NOT NULL AND ($2 OR p.owner_id=$1 OR t.deleted_by=$1)
		         ORDER BY t.deleted_at DESC,t.id DESC LIMIT $3 OFFSET $4`
	case "page_response":
		query = `SELECT r.id::text,'Response '||r.response_key,COALESCE(NULLIF(p.title,''),p.slug),
		                r.deleted_at,r.deleted_by
		         FROM page_section_responses r
		         JOIN page_section_instances s ON s.id=r.section_id
		         JOIN pages p ON p.id=s.page_id
		         WHERE r.deleted_at IS NOT NULL
		           AND ($2 OR p.owner_id=$1 OR r.respondent_user_id=$1 OR r.deleted_by=$1)
		         ORDER BY r.deleted_at DESC,r.id DESC LIMIT $3 OFFSET $4`
	default:
		return nil, trash.ErrNotFound
	}
	if args == nil {
		args = []any{actorID, includeManaged, limit, offset}
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
	if err != nil || id <= 0 {
		return trash.ErrNotFound
	}
	if p.resource == "page_allocation" && !includeManaged {
		return trash.ErrNotFound
	}
	return database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restoredID int64
		var ownerID sql.NullInt64
		var pageID sql.NullInt64
		switch p.resource {
		case "page":
			err = exec.QueryRowContext(
				ctx,
				`UPDATE pages
				 SET deleted_at=NULL, deleted_by=NULL
				 WHERE id=$1 AND deleted_at IS NOT NULL
				   AND ($3 OR owner_id=$2 OR deleted_by=$2)
				 RETURNING id, owner_id`,
				id, actorID, includeManaged,
			).Scan(&restoredID, &ownerID)
		case "page_comment":
			err = exec.QueryRowContext(
				ctx,
				`UPDATE page_comments c
				 SET deleted_at=NULL, deleted_by=NULL
				 FROM pages p
				 WHERE c.id=$1 AND c.deleted_at IS NOT NULL
				   AND p.id=c.page_id AND p.deleted_at IS NULL
				   AND ($3 OR c.user_id=$2 OR c.deleted_by=$2)
				 RETURNING c.id`,
				id, actorID, includeManaged,
			).Scan(&restoredID)
		case "page_allocation":
			err = exec.QueryRowContext(
				ctx,
				`UPDATE user_page_allocations SET deleted_at=NULL,deleted_by=NULL
				 WHERE id=$1 AND deleted_at IS NOT NULL
				 RETURNING id,user_id`,
				id,
			).Scan(&restoredID, &ownerID)
		case "page_section_instance":
			err = exec.QueryRowContext(
				ctx,
				`UPDATE page_section_instances s
				 SET source_index=(SELECT COALESCE(MAX(active.source_index)+1,0)
				                   FROM page_section_instances active
				                   WHERE active.page_id=s.page_id AND active.deleted_at IS NULL),
				     display_order=(SELECT COALESCE(MAX(active.display_order)+1,1)
				                    FROM page_section_instances active
				                    WHERE active.page_id=s.page_id AND active.deleted_at IS NULL),
				     deleted_at=NULL,deleted_by=NULL,updated_at=NOW()
				 FROM pages p
				 WHERE s.id=$1 AND s.deleted_at IS NOT NULL
				   AND p.id=s.page_id AND p.deleted_at IS NULL
				   AND ($3 OR p.owner_id=$2 OR s.deleted_by=$2)
				 RETURNING s.id,s.page_id`,
				id, actorID, includeManaged,
			).Scan(&restoredID, &pageID)
		case "page_section_item":
			err = exec.QueryRowContext(
				ctx,
				`UPDATE page_section_instance_items i
				 SET source_index=(SELECT COALESCE(MAX(active.source_index)+1,0)
				                   FROM page_section_instance_items active
				                   WHERE active.section_id=i.section_id AND active.deleted_at IS NULL),
				     display_order=(SELECT COALESCE(MAX(active.display_order)+1,1)
				                    FROM page_section_instance_items active
				                    WHERE active.section_id=i.section_id AND active.deleted_at IS NULL),
				     deleted_at=NULL,deleted_by=NULL,updated_at=NOW()
				 FROM page_section_instances s,pages p
				 WHERE i.id=$1 AND i.deleted_at IS NOT NULL
				   AND s.id=i.section_id AND s.deleted_at IS NULL
				   AND p.id=s.page_id AND p.deleted_at IS NULL
				   AND ($3 OR p.owner_id=$2 OR i.deleted_by=$2)
				 RETURNING i.id,p.id`,
				id, actorID, includeManaged,
			).Scan(&restoredID, &pageID)
		case "page_theme_token":
			err = exec.QueryRowContext(
				ctx,
				`UPDATE page_theme_tokens t SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW()
				 FROM pages p,page_themes theme
				 WHERE t.id=$1 AND t.deleted_at IS NOT NULL
				   AND theme.page_id=t.page_id AND theme.deleted_at IS NULL
				   AND p.id=t.page_id AND p.deleted_at IS NULL
				   AND ($3 OR p.owner_id=$2 OR t.deleted_by=$2)
				 RETURNING t.id,t.page_id`,
				id, actorID, includeManaged,
			).Scan(&restoredID, &pageID)
		case "page_response":
			err = exec.QueryRowContext(
				ctx,
				`UPDATE page_section_responses r SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW()
				 FROM page_section_instances s,pages p
				 WHERE r.id=$1 AND r.deleted_at IS NOT NULL
				   AND s.id=r.section_id AND s.deleted_at IS NULL
				   AND p.id=s.page_id AND p.deleted_at IS NULL
				   AND ($3 OR p.owner_id=$2 OR r.respondent_user_id=$2 OR r.deleted_by=$2)
				 RETURNING r.id,p.id`,
				id, actorID, includeManaged,
			).Scan(&restoredID, &pageID)
		default:
			return trash.ErrNotFound
		}
		if errors.Is(err, sql.ErrNoRows) {
			return p.restoreFailure(ctx, exec, id, actorID, includeManaged)
		}
		if err != nil {
			if p.resource == "page_theme_token" && strings.Contains(err.Error(), "idx_page_theme_tokens_active_display_order") {
				return trash.ErrConflict
			}
			return err
		}
		if (p.resource == "page" || p.resource == "page_allocation") && ownerID.Valid {
			if _, err := exec.ExecContext(
				ctx,
				`UPDATE user_page_allocations
				 SET used_pages=(
				     SELECT COUNT(*) FROM pages
				     WHERE owner_id=$1 AND deleted_at IS NULL
				 ), updated_at=NOW()
				 WHERE user_id=$1 AND deleted_at IS NULL`,
				ownerID.Int64,
			); err != nil {
				return err
			}
		}
		if pageID.Valid && (p.resource == "page_section_instance" || p.resource == "page_section_item") {
			var current string
			if err := exec.QueryRowContext(ctx,
				`SELECT content::text FROM pages WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
				pageID.Int64,
			).Scan(&current); err != nil {
				return err
			}
			if err := persistTypedPageDefinition(exec, pageID.Int64, current); err != nil {
				return err
			}
		}
		if pageID.Valid && p.resource == "page_theme_token" {
			if _, err := exec.ExecContext(ctx,
				`UPDATE page_themes SET revision=revision+1,updated_by=$2,updated_at=NOW()
				 WHERE page_id=$1 AND deleted_at IS NULL`,
				pageID.Int64, actorID,
			); err != nil {
				return err
			}
		}
		if pageID.Valid && p.resource == "page_response" {
			var current string
			if err := exec.QueryRowContext(ctx,
				`SELECT content::text FROM pages WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
				pageID.Int64,
			).Scan(&current); err != nil {
				return err
			}
			records, err := loadInteractiveResponses(exec, pageID.Int64, nil)
			if err != nil {
				return err
			}
			projected, err := setInteractiveRecords(current, records)
			if err != nil {
				return err
			}
			if _, err := exec.ExecContext(ctx,
				`UPDATE pages SET content=$2::jsonb,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`,
				pageID.Int64, projected,
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
	if p.resource == "page_comment" {
		var authorized bool
		var parentActive bool
		err := exec.QueryRowContext(
			ctx,
			`SELECT COALESCE($3 OR c.user_id=$2 OR c.deleted_by=$2, FALSE),
			        p.deleted_at IS NULL
			 FROM page_comments c
			 JOIN pages p ON p.id=c.page_id
			 WHERE c.id=$1 AND c.deleted_at IS NOT NULL`,
			id, actorID, includeManaged,
		).Scan(&authorized, &parentActive)
		if errors.Is(err, sql.ErrNoRows) || !authorized {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		if !parentActive {
			return trash.ErrConflict
		}
	}
	var query string
	switch p.resource {
	case "page_section_instance":
		query = `SELECT COALESCE($3 OR p.owner_id=$2 OR s.deleted_by=$2,FALSE),p.deleted_at IS NULL
		         FROM page_section_instances s JOIN pages p ON p.id=s.page_id
		         WHERE s.id=$1 AND s.deleted_at IS NOT NULL`
	case "page_section_item":
		query = `SELECT COALESCE($3 OR p.owner_id=$2 OR i.deleted_by=$2,FALSE),
		                s.deleted_at IS NULL AND p.deleted_at IS NULL
		         FROM page_section_instance_items i
		         JOIN page_section_instances s ON s.id=i.section_id
		         JOIN pages p ON p.id=s.page_id
		         WHERE i.id=$1 AND i.deleted_at IS NOT NULL`
	case "page_theme_token":
		query = `SELECT COALESCE($3 OR p.owner_id=$2 OR t.deleted_by=$2,FALSE),
		                theme.deleted_at IS NULL AND p.deleted_at IS NULL
		         FROM page_theme_tokens t JOIN page_themes theme ON theme.page_id=t.page_id
		         JOIN pages p ON p.id=t.page_id
		         WHERE t.id=$1 AND t.deleted_at IS NOT NULL`
	case "page_response":
		query = `SELECT COALESCE($3 OR p.owner_id=$2 OR r.respondent_user_id=$2 OR r.deleted_by=$2,FALSE),
		                s.deleted_at IS NULL AND p.deleted_at IS NULL
		         FROM page_section_responses r JOIN page_section_instances s ON s.id=r.section_id
		         JOIN pages p ON p.id=s.page_id
		         WHERE r.id=$1 AND r.deleted_at IS NOT NULL`
	}
	if query != "" {
		var authorized, parentActive bool
		err := exec.QueryRowContext(ctx, query, id, actorID, includeManaged).Scan(&authorized, &parentActive)
		if errors.Is(err, sql.ErrNoRows) || !authorized {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		if !parentActive {
			return trash.ErrConflict
		}
	}
	return trash.ErrNotFound
}
