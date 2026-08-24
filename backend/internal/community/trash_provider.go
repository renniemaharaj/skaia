package community

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/lib/pq"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/trash"
)

type trashProvider struct{ db database.Executor }

func NewTrashProvider(db database.Executor) trash.Provider { return &trashProvider{db: db} }
func (*trashProvider) Resource() string                    { return "community_publication" }
func (*trashProvider) Label() string                       { return "Community publications" }
func (*trashProvider) ManagePermission() string            { return "community.publication-delete" }
func (p *trashProvider) ListDeleted(ctx context.Context, actorID int64, includeManaged bool, limit, offset int) ([]trash.Item, error) {
	rows, err := p.db.QueryContext(ctx, `SELECT id::text,title,kind,deleted_at,deleted_by FROM community_publications WHERE deleted_at IS NOT NULL AND ($2 OR author_id=$1 OR deleted_by=$1) ORDER BY deleted_at DESC,id DESC LIMIT $3 OFFSET $4`, actorID, includeManaged, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []trash.Item{}
	for rows.Next() {
		var item trash.Item
		var deletedBy sql.NullInt64
		if err = rows.Scan(&item.ID, &item.Label, &item.Detail, &item.DeletedAt, &deletedBy); err != nil {
			return nil, err
		}
		item.Resource = p.Resource()
		if deletedBy.Valid {
			item.DeletedBy = &deletedBy.Int64
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (p *trashProvider) Restore(ctx context.Context, actorID int64, includeManaged bool, rawID string) error {
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return trash.ErrNotFound
	}
	err = database.TransactionalExecutor(ctx, p.db, func(exec database.Executor) error {
		var restored, pageID, threadID int64
		err := exec.QueryRowContext(ctx, `UPDATE community_publications SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW() WHERE id=$1 AND deleted_at IS NOT NULL AND ($3 OR author_id=$2 OR deleted_by=$2) RETURNING id,page_id,canonical_thread_id`, id, actorID, includeManaged).Scan(&restored, &pageID, &threadID)
		if errors.Is(err, sql.ErrNoRows) {
			return trash.ErrNotFound
		}
		if err != nil {
			return err
		}
		if _, err = exec.ExecContext(ctx, `UPDATE pages SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW() WHERE id=$1`, pageID); err != nil {
			return err
		}
		if _, err = exec.ExecContext(ctx, `UPDATE forum_threads SET deleted_at=NULL,deleted_by=NULL,updated_at=NOW() WHERE id=$1`, threadID); err != nil {
			return err
		}
		if _, err = exec.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)VALUES($1,'community_publication',$2,'restore')`, actorID, rawID); err != nil {
			return err
		}
		if _, err = exec.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)VALUES($1,'page',$2,'restore')`, actorID, pageID); err != nil {
			return err
		}
		_, err = exec.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)VALUES($1,'forum_thread',$2,'restore')`, actorID, threadID)
		return err
	})
	var pqErr *pq.Error
	if errors.As(err, &pqErr) && (pqErr.Code == "23505" || pqErr.Code == "23503") {
		return trash.ErrConflict
	}
	return err
}
