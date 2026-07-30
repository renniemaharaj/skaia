package inbox

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
		&trashProvider{db: db, resource: "inbox_conversation", label: "Inbox conversations"},
		&trashProvider{db: db, resource: "inbox_message", label: "Inbox messages"},
	}
}

func (p *trashProvider) Resource() string         { return p.resource }
func (p *trashProvider) Label() string            { return p.label }
func (p *trashProvider) ManagePermission() string { return "inbox.manage" }

func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, managed bool, limit, offset int) ([]trash.Item, error) {
	var query string
	switch p.resource {
	case "inbox_conversation":
		query = `SELECT c.id::text,COALESCE(NULLIF(c.title,''),'Conversation #'||c.id::text),
		                CASE WHEN c.is_group THEN 'Group conversation' ELSE 'Direct conversation' END,
		                c.deleted_at,c.deleted_by
		         FROM inbox_conversations c
		         WHERE c.deleted_at IS NOT NULL
		           AND ($2 OR c.deleted_by=$1 OR EXISTS(
		               SELECT 1 FROM inbox_conversation_participants p
		               WHERE p.conversation_id=c.id AND p.user_id=$1
		           ))
		         ORDER BY c.deleted_at DESC,c.id DESC LIMIT $3 OFFSET $4`
	case "inbox_message":
		query = `SELECT id::text,'Message #'||id::text,'Conversation #'||conversation_id::text,
		                deleted_at,deleted_by
		         FROM inbox_messages
		         WHERE deleted_at IS NOT NULL AND ($2 OR sender_id=$1 OR deleted_by=$1)
		         ORDER BY deleted_at DESC,id DESC LIMIT $3 OFFSET $4`
	default:
		return nil, trash.ErrNotFound
	}
	rows, err := p.db.QueryContext(ctx, query, actorID, managed, limit, offset)
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
	return database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restored int64
		switch p.resource {
		case "inbox_conversation":
			err = exec.QueryRowContext(ctx,
				`UPDATE inbox_conversations c SET deleted_at=NULL,deleted_by=NULL
				 WHERE c.id=$1 AND c.deleted_at IS NOT NULL
				   AND ($3 OR c.deleted_by=$2 OR EXISTS(
				       SELECT 1 FROM inbox_conversation_participants p
				       WHERE p.conversation_id=c.id AND p.user_id=$2
				   ))
				 RETURNING c.id`, id, actorID, managed).Scan(&restored)
		case "inbox_message":
			err = exec.QueryRowContext(ctx,
				`UPDATE inbox_messages m SET deleted_at=NULL,deleted_by=NULL
				 FROM inbox_conversations c
				 WHERE m.id=$1 AND m.deleted_at IS NOT NULL
				   AND c.id=m.conversation_id AND c.deleted_at IS NULL
				   AND ($3 OR m.sender_id=$2 OR m.deleted_by=$2)
				 RETURNING m.id`, id, actorID, managed).Scan(&restored)
		default:
			return trash.ErrNotFound
		}
		if errors.Is(err, sql.ErrNoRows) {
			if p.resource == "inbox_message" {
				var allowed, parentActive bool
				lookupErr := exec.QueryRowContext(ctx,
					`SELECT COALESCE($3 OR m.sender_id=$2 OR m.deleted_by=$2,FALSE),
					        c.deleted_at IS NULL
					 FROM inbox_messages m JOIN inbox_conversations c ON c.id=m.conversation_id
					 WHERE m.id=$1 AND m.deleted_at IS NOT NULL`,
					id, actorID, managed).Scan(&allowed, &parentActive)
				if lookupErr == nil && allowed && !parentActive {
					return trash.ErrConflict
				}
				if lookupErr != nil && !errors.Is(lookupErr, sql.ErrNoRows) {
					return lookupErr
				}
			}
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		_, err = exec.ExecContext(ctx,
			`INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)
			 VALUES ($1,$2,$3,'restore')`, actorID, p.resource, rawID)
		return err
	})
}
