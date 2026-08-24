package community

import (
	"context"
	"database/sql"
	"encoding/json"
)

type SQLRepository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *SQLRepository { return &SQLRepository{db: db} }

const pubCols = `p.id,p.kind,p.slug,p.title,p.summary,''::text,p.page_id,pg.slug,p.visibility,p.publication_status,p.author_id,u.username,p.canonical_thread_id,p.created_at,p.updated_at`

func scanPublication(row interface{ Scan(...any) error }) (*Publication, error) {
	v := &Publication{}
	err := row.Scan(&v.ID, &v.Kind, &v.Slug, &v.Title, &v.Summary, &v.Body, &v.PageID, &v.PageSlug, &v.Visibility, &v.PublicationStatus, &v.AuthorID, &v.AuthorName, &v.CanonicalThreadID, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func (r *SQLRepository) Create(ctx context.Context, user int64, v CreateRequest) (*Publication, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var threadCategoryID, threadID int64
	if err = tx.QueryRowContext(ctx, `INSERT INTO forum_categories(name,description,display_order,is_pinned,is_locked)
		VALUES('Community Discussions','Discussion threads owned by community proposals, showcases, and events.',0,FALSE,FALSE)
		ON CONFLICT(name) DO UPDATE SET deleted_at=NULL,deleted_by=NULL RETURNING id`).Scan(&threadCategoryID); err != nil {
		return nil, err
	}
	if err = tx.QueryRowContext(ctx, `INSERT INTO forum_threads(category_id,user_id,title,content)
		VALUES($1,$2,$3,'<p>Discuss this community publication here.</p>') RETURNING id`, threadCategoryID, user, v.Title).Scan(&threadID); err != nil {
		return nil, err
	}
	pageVisibility := "private"
	if v.Visibility == "public" && v.PublicationStatus == "published" {
		pageVisibility = "public"
	}
	pageSlug := "community-" + v.Kind + "-" + v.Slug
	var pageID int64
	if err = tx.QueryRowContext(ctx, `INSERT INTO pages(slug,title,description,content,owner_id,visibility)VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING id`, pageSlug, v.Title, v.Summary, defaultJSON([]byte(v.Body)), user, pageVisibility).Scan(&pageID); err != nil {
		return nil, err
	}
	p, err := scanPublication(tx.QueryRowContext(ctx, `WITH inserted AS (
		INSERT INTO community_publications(kind,slug,title,summary,page_id,visibility,publication_status,author_id,canonical_thread_id)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING *
	) SELECT i.id,i.kind,i.slug,i.title,i.summary,''::text,i.page_id,pg.slug,i.visibility,i.publication_status,i.author_id,(SELECT username FROM users WHERE id=$8),i.canonical_thread_id,i.created_at,i.updated_at FROM inserted i JOIN pages pg ON pg.id=i.page_id`, v.Kind, v.Slug, v.Title, v.Summary, pageID, v.Visibility, v.PublicationStatus, user, threadID))
	if err != nil {
		return nil, err
	}
	switch v.Kind {
	case "proposal":
		_, err = tx.ExecContext(ctx, `INSERT INTO community_proposals(publication_id)VALUES($1)`, p.ID)
	case "showcase":
		media := v.Media
		if len(media) == 0 {
			media = json.RawMessage("[]")
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO community_showcases(publication_id,media,credits)VALUES($1,$2,$3)`, p.ID, media, v.Credits)
	case "event":
		_, err = tx.ExecContext(ctx, `INSERT INTO community_events(publication_id,starts_at,ends_at,location,capacity)VALUES($1,$2,$3,$4,$5)`, p.ID, v.StartsAt, v.EndsAt, v.Location, v.Capacity)
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO community_workflow_events(publication_id,actor_id,action,after_state)VALUES($1,$2,'create',$3)`, p.ID, user, v.PublicationStatus); err != nil {
		return nil, err
	}
	return p, tx.Commit()
}
func policy(user int64) string {
	return `($1<0) OR (p.publication_status='published' AND p.visibility='public') OR ($1>0 AND p.publication_status='published' AND p.visibility='members') OR p.author_id=$1`
}
func (r *SQLRepository) List(ctx context.Context, user int64, kind string, cursor int64, limit int, q string) (Page, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+pubCols+` FROM community_publications p JOIN users u ON u.id=p.author_id JOIN pages pg ON pg.id=p.page_id AND pg.deleted_at IS NULL WHERE p.kind=$2 AND p.deleted_at IS NULL AND u.deleted_at IS NULL AND (`+policy(user)+`) AND ($3=0 OR p.id<$3) AND ($5='' OR p.title ILIKE '%'||$5||'%' OR p.summary ILIKE '%'||$5||'%') ORDER BY p.id DESC LIMIT $4`, user, kind, cursor, limit+1, q)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	out := Page{Items: []Publication{}}
	for rows.Next() {
		v, err := scanPublication(rows)
		if err != nil {
			return out, err
		}
		out.Items = append(out.Items, *v)
	}
	if len(out.Items) > limit {
		out.NextCursor = out.Items[limit-1].ID
		out.Items = out.Items[:limit]
	}
	return out, rows.Err()
}
func (r *SQLRepository) Get(ctx context.Context, user int64, kind string, id int64) (*Publication, error) {
	p, err := scanPublication(r.db.QueryRowContext(ctx, `SELECT `+pubCols+` FROM community_publications p JOIN users u ON u.id=p.author_id JOIN pages pg ON pg.id=p.page_id AND pg.deleted_at IS NULL WHERE p.id=$2 AND p.deleted_at IS NULL AND u.deleted_at IS NULL AND (`+policy(user)+`) AND ($3='' OR p.kind=$3)`, user, id, kind))
	if err != nil {
		return nil, err
	}
	switch p.Kind {
	case "proposal":
		v := &Proposal{}
		err = r.db.QueryRowContext(ctx, `SELECT q.state,q.decision,COALESCE(SUM(v.value),0),COALESCE(MAX(CASE WHEN v.user_id=$2 THEN v.value END),0) FROM community_proposals q LEFT JOIN community_proposal_votes v ON v.proposal_id=q.publication_id WHERE q.publication_id=$1 GROUP BY q.state,q.decision`, id, user).Scan(&v.State, &v.Decision, &v.Score, &v.OwnVote)
		p.Proposal = v
	case "showcase":
		v := &Showcase{}
		err = r.db.QueryRowContext(ctx, `SELECT media,credits FROM community_showcases WHERE publication_id=$1`, id).Scan(&v.Media, &v.Credits)
		p.Showcase = v
	case "event":
		v := &Event{}
		err = r.db.QueryRowContext(ctx, `SELECT e.starts_at,e.ends_at,e.location,e.capacity,COUNT(a.user_id) FILTER(WHERE a.status='going'),COALESCE(MAX(CASE WHEN a.user_id=$2 THEN a.status END),'') FROM community_events e LEFT JOIN community_event_attendance a ON a.event_id=e.publication_id WHERE e.publication_id=$1 GROUP BY e.starts_at,e.ends_at,e.location,e.capacity`, id, user).Scan(&v.StartsAt, &v.EndsAt, &v.Location, &v.Capacity, &v.Going, &v.OwnAttendance)
		p.Event = v
	}
	return p, err
}
func (r *SQLRepository) Update(ctx context.Context, actor, id int64, v UpdateRequest) (*Publication, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var kind, beforeStatus string
	var pageID int64
	if err = tx.QueryRowContext(ctx, `SELECT kind,page_id,publication_status FROM community_publications WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, id).Scan(&kind, &pageID, &beforeStatus); err != nil {
		return nil, err
	}
	pageVisibility := "private"
	if v.Visibility == "public" && v.PublicationStatus == "published" {
		pageVisibility = "public"
	}
	pageSlug := "community-" + kind + "-" + v.Slug
	if _, err = tx.ExecContext(ctx, `UPDATE pages SET slug=$2,title=$3,description=$4,visibility=$5,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, pageID, pageSlug, v.Title, v.Summary, pageVisibility); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE community_publications SET slug=$2,title=$3,summary=$4,visibility=$5,publication_status=$6,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id, v.Slug, v.Title, v.Summary, v.Visibility, v.PublicationStatus); err != nil {
		return nil, err
	}
	switch kind {
	case "showcase":
		media := v.Media
		if len(media) == 0 {
			media = json.RawMessage("[]")
		}
		_, err = tx.ExecContext(ctx, `UPDATE community_showcases SET media=$2,credits=$3 WHERE publication_id=$1`, id, media, v.Credits)
	case "event":
		_, err = tx.ExecContext(ctx, `UPDATE community_events SET starts_at=$2,ends_at=$3,location=$4,capacity=$5 WHERE publication_id=$1`, id, v.StartsAt, v.EndsAt, v.Location, v.Capacity)
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO community_workflow_events(publication_id,actor_id,action,before_state,after_state)VALUES($1,$2,'update',$3,$4)`, id, actor, beforeStatus, v.PublicationStatus); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return r.Get(ctx, -actor, kind, id)
}
func (r *SQLRepository) Transition(ctx context.Context, actor, id int64, expected, next, decision string) (*Publication, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var before string
	if err = tx.QueryRowContext(ctx, `SELECT state FROM community_proposals WHERE publication_id=$1 FOR UPDATE`, id).Scan(&before); err != nil {
		return nil, err
	}
	if before != expected {
		return nil, ErrTransition
	}
	if _, err = tx.ExecContext(ctx, `UPDATE community_proposals SET state=$2,decision=$3,decided_by=$4,decided_at=NOW() WHERE publication_id=$1`, id, next, decision, actor); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO community_workflow_events(publication_id,actor_id,action,before_state,after_state)VALUES($1,$2,'transition',$3,$4)`, id, actor, before, next); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return r.Get(ctx, -actor, "proposal", id)
}
func (r *SQLRepository) Vote(ctx context.Context, user, id int64, value int) (*Publication, error) {
	result, err := r.db.ExecContext(ctx, `INSERT INTO community_proposal_votes(proposal_id,user_id,value) SELECT q.publication_id,$2,$3 FROM community_proposals q JOIN community_publications p ON p.id=q.publication_id WHERE q.publication_id=$1 AND q.state IN ('submitted','under_review') AND p.deleted_at IS NULL AND p.publication_status='published' AND (p.visibility IN ('public','members') OR p.author_id=$2) ON CONFLICT(proposal_id,user_id)DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, id, user, value)
	if err != nil {
		return nil, err
	}
	if affected, affectedErr := result.RowsAffected(); affectedErr != nil {
		return nil, affectedErr
	} else if affected == 0 {
		return nil, ErrTransition
	}
	return r.Get(ctx, user, "proposal", id)
}
func (r *SQLRepository) Attend(ctx context.Context, user, id int64, status string) (*Publication, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, id); err != nil {
		return nil, err
	}
	var capacity sql.NullInt64
	var current int
	if err = tx.QueryRowContext(ctx, `SELECT e.capacity FROM community_events e JOIN community_publications p ON p.id=e.publication_id WHERE e.publication_id=$1 AND p.deleted_at IS NULL AND p.publication_status='published' AND (p.visibility IN ('public','members') OR p.author_id=$2) FOR UPDATE OF e`, id, user).Scan(&capacity); err != nil {
		return nil, err
	}
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM community_event_attendance WHERE event_id=$1 AND status='going'`, id).Scan(&current); err != nil {
		return nil, err
	}
	if status == "going" && capacity.Valid && current >= int(capacity.Int64) {
		var own string
		ownErr := tx.QueryRowContext(ctx, `SELECT status FROM community_event_attendance WHERE event_id=$1 AND user_id=$2`, id, user).Scan(&own)
		if ownErr != nil || own != "going" {
			return nil, ErrCapacity
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO community_event_attendance(event_id,user_id,status)VALUES($1,$2,$3) ON CONFLICT(event_id,user_id)DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()`, id, user, status)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return r.Get(ctx, user, "event", id)
}
func (r *SQLRepository) Delete(ctx context.Context, user, id int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var pageID, threadID int64
	err = tx.QueryRowContext(ctx, `UPDATE community_publications SET deleted_at=NOW(),deleted_by=$2,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING page_id,canonical_thread_id`, id, user).Scan(&pageID, &threadID)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE pages SET deleted_at=COALESCE(deleted_at,NOW()),deleted_by=COALESCE(deleted_by,$2),updated_at=NOW() WHERE id=$1`, pageID, user); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE forum_threads SET deleted_at=COALESCE(deleted_at,NOW()),deleted_by=COALESCE(deleted_by,$2),updated_at=NOW() WHERE id=$1`, threadID, user); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)VALUES($1,'community_publication',$2,'delete')`, user, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)VALUES($1,'page',$2,'delete')`, user, pageID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO resource_lifecycle_events(actor_id,resource_type,resource_id,action)VALUES($1,'forum_thread',$2,'delete')`, user, threadID); err != nil {
		return err
	}
	return tx.Commit()
}
