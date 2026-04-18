package page

import (
	"database/sql"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by Postgres.
func NewRepository(db *sql.DB) Repository { return &sqlRepository{db: db} }

// ── reads ───────────────────────────────────────────────────────────────────

func (r *sqlRepository) GetBySlug(slug string) (*models.Page, error) {
	p := &models.Page{}
	var ownerID sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, COALESCE(view_count, 0), visibility, created_at, updated_at
		 FROM pages WHERE slug = $1`, slug,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &ownerID, &p.ViewCount, &p.Visibility, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if ownerID.Valid {
		p.OwnerID = &ownerID.Int64
	}
	return p, nil
}

func (r *sqlRepository) GetIndex() (*models.Page, error) {
	p := &models.Page{}
	var ownerID sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, COALESCE(view_count, 0), visibility, created_at, updated_at
		 FROM pages WHERE is_index = TRUE LIMIT 1`,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &ownerID, &p.ViewCount, &p.Visibility, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if ownerID.Valid {
		p.OwnerID = &ownerID.Int64
	}
	return p, nil
}

func (r *sqlRepository) GetByID(id int64) (*models.Page, error) {
	p := &models.Page{}
	var ownerID sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, COALESCE(view_count, 0), visibility, created_at, updated_at
		 FROM pages WHERE id = $1`, id,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.IsIndex,
		&p.Content, &ownerID, &p.ViewCount, &p.Visibility, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if ownerID.Valid {
		p.OwnerID = &ownerID.Int64
	}
	return p, nil
}

func (r *sqlRepository) List() ([]*models.Page, error) {
	rows, err := r.db.Query(
		`SELECT id, slug, title, description, is_index, content::text,
		        owner_id, COALESCE(view_count, 0), visibility, created_at, updated_at
		 FROM pages ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*models.Page
	for rows.Next() {
		p := &models.Page{}
		var ownerID sql.NullInt64
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Description,
			&p.IsIndex, &p.Content, &ownerID, &p.ViewCount, &p.Visibility, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			p.OwnerID = &ownerID.Int64
		}
		pages = append(pages, p)
	}
	return pages, nil
}

// ── writes ──────────────────────────────────────────────────────────────────

func (r *sqlRepository) Create(p *models.Page) error {
	return r.db.QueryRow(
		`INSERT INTO pages (slug, title, description, is_index, content, owner_id, visibility)
		 VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
		 RETURNING id, created_at, updated_at`,
		p.Slug, p.Title, p.Description, p.IsIndex, p.Content, p.OwnerID, p.Visibility,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

func (r *sqlRepository) Update(p *models.Page) error {
	return r.db.QueryRow(
		`UPDATE pages
		 SET slug = $2, title = $3, description = $4, is_index = $5,
		     content = $6::jsonb, visibility = $7, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1
		 RETURNING updated_at`,
		p.ID, p.Slug, p.Title, p.Description, p.IsIndex, p.Content, p.Visibility,
	).Scan(&p.UpdatedAt)
}

func (r *sqlRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM pages WHERE id = $1`, id)
	return err
}

// ── ownership & editors ─────────────────────────────────────────────────────

func (r *sqlRepository) SetOwner(pageID, ownerID int64) error {
	_, err := r.db.Exec(`UPDATE pages SET owner_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, pageID, ownerID)
	return err
}

func (r *sqlRepository) ClearOwner(pageID int64) error {
	_, err := r.db.Exec(`UPDATE pages SET owner_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, pageID)
	return err
}

func (r *sqlRepository) AddEditor(pageID, userID, grantedBy int64) error {
	_, err := r.db.Exec(
		`INSERT INTO page_editors (page_id, user_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT (page_id, user_id) DO NOTHING`,
		pageID, userID, grantedBy,
	)
	return err
}

func (r *sqlRepository) RemoveEditor(pageID, userID int64) error {
	_, err := r.db.Exec(`DELETE FROM page_editors WHERE page_id = $1 AND user_id = $2`, pageID, userID)
	return err
}

func (r *sqlRepository) GetEditors(pageID int64) ([]*models.PageUser, error) {
	rows, err := r.db.Query(
		`SELECT u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
		 FROM page_editors pe JOIN users u ON u.id = pe.user_id
		 WHERE pe.page_id = $1 ORDER BY pe.granted_at`, pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*models.PageUser
	for rows.Next() {
		u := &models.PageUser{}
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *sqlRepository) GetOwner(pageID int64) (*models.PageUser, error) {
	u := &models.PageUser{}
	err := r.db.QueryRow(
		`SELECT u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
		 FROM pages p JOIN users u ON u.id = p.owner_id
		 WHERE p.id = $1`, pageID,
	).Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *sqlRepository) IsEditor(pageID, userID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_editors WHERE page_id = $1 AND user_id = $2`, pageID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *sqlRepository) ListWithOwnership() ([]*models.Page, error) {
	rows, err := r.db.Query(
		`SELECT p.id, p.slug, p.title, p.description, p.is_index, p.content::text,
		        p.owner_id, COALESCE(p.view_count, 0), p.visibility, p.created_at, p.updated_at,
		        u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''),
		        (SELECT COUNT(*) FROM page_likes WHERE page_id = p.id),
		        (SELECT COUNT(*) FROM page_comments WHERE page_id = p.id)
		 FROM pages p
		 LEFT JOIN users u ON u.id = p.owner_id
		 ORDER BY p.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*models.Page
	for rows.Next() {
		p := &models.Page{}
		var ownerID sql.NullInt64
		var oID sql.NullInt64
		var oUsername, oDisplayName, oAvatar sql.NullString
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Description,
			&p.IsIndex, &p.Content, &ownerID, &p.ViewCount, &p.Visibility, &p.CreatedAt, &p.UpdatedAt,
			&oID, &oUsername, &oDisplayName, &oAvatar,
			&p.Likes, &p.CommentCount); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			p.OwnerID = &ownerID.Int64
		}
		if oID.Valid {
			p.Owner = &models.PageUser{
				ID:          oID.Int64,
				Username:    oUsername.String,
				DisplayName: oDisplayName.String,
				AvatarURL:   oAvatar.String,
			}
		}
		pages = append(pages, p)
	}
	return pages, rows.Err()
}

// ── engagement: views, likes, comments ──────────────────────────────────────

func (r *sqlRepository) RecordView(pageID int64, userID *int64) error {
	var uid sql.NullInt64
	if userID != nil {
		uid = sql.NullInt64{Int64: *userID, Valid: true}
	}
	_, err := r.db.Exec(
		`INSERT INTO page_views (page_id, user_id) VALUES ($1, $2)`, pageID, uid)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(
		`UPDATE pages SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1`, pageID)
	return err
}

func (r *sqlRepository) LikePage(pageID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`INSERT INTO page_likes (page_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, pageID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(`SELECT COUNT(*) FROM page_likes WHERE page_id = $1`, pageID).Scan(&count)
	return count, err
}

func (r *sqlRepository) UnlikePage(pageID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`DELETE FROM page_likes WHERE page_id = $1 AND user_id = $2`, pageID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(`SELECT COUNT(*) FROM page_likes WHERE page_id = $1`, pageID).Scan(&count)
	return count, err
}

func (r *sqlRepository) IsPageLikedByUser(pageID, userID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_likes WHERE page_id = $1 AND user_id = $2`, pageID, userID).Scan(&count)
	return count > 0, err
}

func (r *sqlRepository) GetPageLikeCount(pageID int64) (int, error) {
	var count int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM page_likes WHERE page_id = $1`, pageID).Scan(&count)
	return count, err
}

func (r *sqlRepository) GetPageCommentCount(pageID int64) (int, error) {
	var count int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM page_comments WHERE page_id = $1`, pageID).Scan(&count)
	return count, err
}

// ── page comments ───────────────────────────────────────────────────────────

func (r *sqlRepository) CreateComment(c *models.PageComment) (*models.PageComment, error) {
	err := r.db.QueryRow(
		`INSERT INTO page_comments (page_id, user_id, content) VALUES ($1, $2, $3)
		 RETURNING id, created_at, updated_at`,
		c.PageID, c.UserID, c.Content,
	).Scan(&c.ID, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (r *sqlRepository) GetComment(id int64) (*models.PageComment, error) {
	c := &models.PageComment{}
	err := r.db.QueryRow(
		`SELECT c.id, c.page_id, c.user_id, c.content, c.created_at, c.updated_at,
		        u.username, COALESCE(u.avatar_url, '')
		 FROM page_comments c JOIN users u ON u.id = c.user_id
		 WHERE c.id = $1`, id,
	).Scan(&c.ID, &c.PageID, &c.UserID, &c.Content, &c.CreatedAt, &c.UpdatedAt,
		&c.AuthorName, &c.AuthorAvatar)
	return c, err
}

func (r *sqlRepository) ListComments(pageID int64, limit, offset int) ([]*models.PageComment, error) {
	rows, err := r.db.Query(
		`SELECT c.id, c.page_id, c.user_id, c.content, c.created_at, c.updated_at,
		        u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, ''),
		        (SELECT COUNT(*) FROM page_comment_likes WHERE page_comment_id = c.id)
		 FROM page_comments c JOIN users u ON u.id = c.user_id
		 WHERE c.page_id = $1
		 ORDER BY c.created_at ASC
		 LIMIT $2 OFFSET $3`, pageID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*models.PageComment
	for rows.Next() {
		c := &models.PageComment{}
		if err := rows.Scan(&c.ID, &c.PageID, &c.UserID, &c.Content,
			&c.CreatedAt, &c.UpdatedAt, &c.AuthorName, &c.AuthorName, &c.AuthorAvatar,
			&c.Likes); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

func (r *sqlRepository) UpdateComment(c *models.PageComment) error {
	_, err := r.db.Exec(
		`UPDATE page_comments SET content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		c.ID, c.Content)
	return err
}

func (r *sqlRepository) DeleteComment(id int64) error {
	_, err := r.db.Exec(`DELETE FROM page_comments WHERE id = $1`, id)
	return err
}

func (r *sqlRepository) LikeComment(commentID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`INSERT INTO page_comment_likes (page_comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		commentID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(`SELECT COUNT(*) FROM page_comment_likes WHERE page_comment_id = $1`, commentID).Scan(&count)
	return count, err
}

func (r *sqlRepository) UnlikeComment(commentID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`DELETE FROM page_comment_likes WHERE page_comment_id = $1 AND user_id = $2`,
		commentID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(`SELECT COUNT(*) FROM page_comment_likes WHERE page_comment_id = $1`, commentID).Scan(&count)
	return count, err
}

func (r *sqlRepository) IsCommentLikedByUser(commentID, userID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_comment_likes WHERE page_comment_id = $1 AND user_id = $2`,
		commentID, userID).Scan(&count)
	return count > 0, err
}

// ── page allocations ────────────────────────────────────────────────────────

func (r *sqlRepository) GetAllocation(userID int64) (*models.UserPageAllocation, error) {
	a := &models.UserPageAllocation{}
	err := r.db.QueryRow(
		`SELECT a.id, a.user_id, a.max_pages, a.used_pages, a.created_at, a.updated_at,
		        u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, '')
		 FROM user_page_allocations a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.user_id = $1`, userID,
	).Scan(&a.ID, &a.UserID, &a.MaxPages, &a.UsedPages, &a.CreatedAt, &a.UpdatedAt,
		&a.Username, &a.DisplayName, &a.AvatarURL)
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (r *sqlRepository) UpsertAllocation(userID, maxPages int64) error {
	_, err := r.db.Exec(
		`INSERT INTO user_page_allocations (user_id, max_pages, updated_at)
		 VALUES ($1, $2, CURRENT_TIMESTAMP)
		 ON CONFLICT (user_id) DO UPDATE
		   SET max_pages = $2, updated_at = CURRENT_TIMESTAMP`,
		userID, maxPages)
	return err
}

func (r *sqlRepository) IncrementUsed(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE user_page_allocations
		 SET used_pages = used_pages + 1, updated_at = CURRENT_TIMESTAMP
		 WHERE user_id = $1`, userID)
	return err
}

func (r *sqlRepository) DecrementUsed(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE user_page_allocations
		 SET used_pages = GREATEST(used_pages - 1, 0), updated_at = CURRENT_TIMESTAMP
		 WHERE user_id = $1`, userID)
	return err
}

func (r *sqlRepository) ListAllocations() ([]*models.UserPageAllocation, error) {
	rows, err := r.db.Query(
		`SELECT a.id, a.user_id, a.max_pages, a.used_pages, a.created_at, a.updated_at,
		        u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, '')
		 FROM user_page_allocations a
		 JOIN users u ON u.id = a.user_id
		 ORDER BY a.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.UserPageAllocation
	for rows.Next() {
		a := &models.UserPageAllocation{}
		if err := rows.Scan(&a.ID, &a.UserID, &a.MaxPages, &a.UsedPages,
			&a.CreatedAt, &a.UpdatedAt, &a.Username, &a.DisplayName, &a.AvatarURL); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *sqlRepository) DeleteAllocation(userID int64) error {
	_, err := r.db.Exec(`DELETE FROM user_page_allocations WHERE user_id = $1`, userID)
	return err
}

func (r *sqlRepository) SetUsedPages(userID int64, count int) error {
	_, err := r.db.Exec(
		`UPDATE user_page_allocations SET used_pages = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
		userID, count)
	return err
}

func (r *sqlRepository) CountOwnedPages(userID int64) (int, error) {
	var count int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE owner_id = $1`, userID).Scan(&count)
	return count, err
}

func (r *sqlRepository) GetNoreplyUserID() (int64, error) {
	var id int64
	err := r.db.QueryRow(`SELECT id FROM users WHERE username = 'noreply' LIMIT 1`).Scan(&id)
	return id, err
}
