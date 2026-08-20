package page

import (
	"context"
	"database/sql"
	"strconv"

	"github.com/lib/pq"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db database.Executor }

// NewRepository returns a Repository backed by Postgres.
func NewRepository(db database.Executor) Repository { return &sqlRepository{db: db} }

// reads
func (r *sqlRepository) GetBySlug(slug string) (*models.Page, error) {
	p := &models.Page{}
	var ownerID sql.NullInt64
	err := r.db.QueryRow(
		`SELECT id, slug, title, description, seo_title, seo_description, seo_image, content::text,
		        owner_id,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='page' AND resource_id=pages.id), 0),
		        visibility, created_at, updated_at
		 FROM pages WHERE slug = $1 AND deleted_at IS NULL`, slug,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.SEOTitle, &p.SEODesc, &p.SEOImage,
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
		`SELECT id, slug, title, description, seo_title, seo_description, seo_image, content::text,
		        owner_id,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='page' AND resource_id=pages.id), 0),
		        visibility, created_at, updated_at
		 FROM pages WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.SEOTitle, &p.SEODesc, &p.SEOImage,
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
		`SELECT id, slug, title, description, seo_title, seo_description, seo_image, content::text,
		        owner_id,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='page' AND resource_id=pages.id), 0),
		        visibility, created_at, updated_at
		 FROM pages WHERE deleted_at IS NULL ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*models.Page
	for rows.Next() {
		p := &models.Page{}
		var ownerID sql.NullInt64
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.SEOTitle, &p.SEODesc, &p.SEOImage,
			&p.Content, &ownerID, &p.ViewCount, &p.Visibility, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			p.OwnerID = &ownerID.Int64
		}
		pages = append(pages, p)
	}
	return pages, nil
}

// writes
func (r *sqlRepository) Create(p *models.Page) error {
	return r.db.QueryRow(
		`INSERT INTO pages (slug, title, description, seo_title, seo_description, seo_image, content, owner_id, visibility)
			 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
			 RETURNING id, created_at, updated_at`,
		p.Slug, p.Title, p.Description, p.SEOTitle, p.SEODesc, p.SEOImage, p.Content, p.OwnerID, p.Visibility,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

// UpdatePreservingInteractive serializes an ordinary page-builder save with
// participant writes and preserves the records owned by interactive configs.
func (r *sqlRepository) UpdatePreservingInteractive(p *models.Page) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var current string
		if err := exec.QueryRow(
			`SELECT content::text FROM pages
			 WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
			p.ID,
		).Scan(&current); err != nil {
			return err
		}
		merged, err := mergeInteractiveRecords(current, p.Content)
		if err != nil {
			return err
		}
		p.Content = merged
		if err := exec.QueryRow(
			`UPDATE pages
				 SET slug = $2, title = $3, description = $4,
				     seo_title = $5, seo_description = $6, seo_image = $7,
				     content = $8::jsonb, visibility = $9, updated_at = CURRENT_TIMESTAMP
			 WHERE id = $1 AND deleted_at IS NULL
			 RETURNING updated_at`,
			p.ID, p.Slug, p.Title, p.Description, p.SEOTitle, p.SEODesc, p.SEOImage, p.Content, p.Visibility,
		).Scan(&p.UpdatedAt); err != nil {
			return err
		}
		return nil
	})
}

func (r *sqlRepository) UpdateSEO(pageID int64, title, description, image string) error {
	_, err := r.db.Exec(
		`UPDATE pages SET seo_title=$2,seo_description=$3,seo_image=$4,updated_at=CURRENT_TIMESTAMP
		 WHERE id=$1 AND deleted_at IS NULL`,
		pageID, title, description, image,
	)
	return err
}

// MutateContent locks and rewrites the authoritative pages.content document.
func (r *sqlRepository) MutateContent(pageID int64, mutate func(string) (string, error)) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var current string
		if err := exec.QueryRow(
			`SELECT content::text FROM pages
			 WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
			pageID,
		).Scan(&current); err != nil {
			return err
		}
		next, err := mutate(current)
		if err != nil {
			return err
		}
		if _, err = exec.Exec(
			`UPDATE pages SET content = $2::jsonb, updated_at = CURRENT_TIMESTAMP
			 WHERE id = $1 AND deleted_at IS NULL`,
			pageID, next,
		); err != nil {
			return err
		}
		return nil
	})
}

func (r *sqlRepository) Delete(id, actorID int64) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		var slug string
		if err := exec.QueryRow(
			`UPDATE pages
			 SET deleted_at=COALESCE(deleted_at, NOW()),
			     deleted_by=COALESCE(deleted_by, $2)
			 WHERE id=$1 AND deleted_at IS NULL
			 RETURNING slug`,
			id, actorID,
		).Scan(&slug); err != nil {
			if err == sql.ErrNoRows {
				return nil
			}
			return err
		}
		if _, err := exec.Exec(
			`UPDATE site_config SET value='""'::jsonb, updated_at=NOW()
			 WHERE key='landing_page_slug' AND value=to_jsonb($1::text)`,
			slug,
		); err != nil {
			return err
		}
		_, err := exec.Exec(
			`INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
			 VALUES ($1, 'page', $2, 'delete')`,
			actorID, strconv.FormatInt(id, 10),
		)
		return err
	})
}

func (r *sqlRepository) DeleteAll(actorID int64) error {
	return database.TransactionalExecutor(context.Background(), r.db, func(exec database.Executor) error {
		if _, err := exec.Exec(
			`WITH changed AS (
			    UPDATE pages
			    SET deleted_at=COALESCE(deleted_at, NOW()),
			        deleted_by=COALESCE(deleted_by, $1)
			    WHERE deleted_at IS NULL
			    RETURNING id
			 )
			 INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
			 SELECT $1, 'page', id::text, 'delete' FROM changed`,
			actorID,
		); err != nil {
			return err
		}
		_, err := exec.Exec(
			`UPDATE site_config SET value='""'::jsonb, updated_at=NOW()
			 WHERE key='landing_page_slug'`,
		)
		return err
	})
}

// ownership & editors
func (r *sqlRepository) SetOwner(pageID, ownerID int64) error {
	_, err := r.db.Exec(
		`UPDATE pages SET owner_id = $2, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1 AND deleted_at IS NULL`,
		pageID, ownerID,
	)
	return err
}

func (r *sqlRepository) ClearOwner(pageID int64) error {
	_, err := r.db.Exec(
		`UPDATE pages SET owner_id = NULL, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1 AND deleted_at IS NULL`,
		pageID,
	)
	return err
}

func (r *sqlRepository) AddEditor(pageID, userID, grantedBy int64) error {
	_, err := r.db.Exec(
		`INSERT INTO page_editors (page_id, user_id, granted_by, inactive_at, inactive_by)
		 SELECT $1, $2, $3, NULL, NULL
		 WHERE EXISTS (SELECT 1 FROM pages WHERE id=$1 AND deleted_at IS NULL)
		 ON CONFLICT (page_id, user_id) DO UPDATE
		 SET inactive_at=NULL, inactive_by=NULL, granted_by=$3, granted_at=CURRENT_TIMESTAMP`,
		pageID, userID, grantedBy,
	)
	return err
}

func (r *sqlRepository) RemoveEditor(pageID, userID int64) error {
	_, err := r.db.Exec(
		`UPDATE page_editors
		 SET inactive_at=COALESCE(inactive_at, NOW())
		 WHERE page_id=$1 AND user_id=$2 AND inactive_at IS NULL`,
		pageID, userID,
	)
	return err
}

func (r *sqlRepository) GetEditors(pageID int64) ([]*models.PageUser, error) {
	rows, err := r.db.Query(
		`SELECT u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), u.background_video_url, u.background_image_url, u.background_position
		 FROM page_editors pe JOIN users u ON u.id = pe.user_id
		 JOIN pages p ON p.id=pe.page_id AND p.deleted_at IS NULL
		 WHERE pe.page_id = $1 AND pe.inactive_at IS NULL
		 ORDER BY pe.granted_at`, pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*models.PageUser
	for rows.Next() {
		u := &models.PageUser{}
		var bgVid, bgImg, bgPos sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &bgVid, &bgImg, &bgPos); err != nil {
			return nil, err
		}
		if bgVid.Valid {
			u.BackgroundVideoURL = bgVid.String
		}
		if bgImg.Valid {
			u.BackgroundImageURL = bgImg.String
		}
		if bgPos.Valid {
			u.BackgroundPosition = bgPos.String
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *sqlRepository) GetOwner(pageID int64) (*models.PageUser, error) {
	u := &models.PageUser{}
	var bgVid, bgImg, bgPos sql.NullString
	err := r.db.QueryRow(
		`SELECT u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), u.background_video_url, u.background_image_url, u.background_position
		 FROM pages p JOIN users u ON u.id = p.owner_id
		 WHERE p.id = $1 AND p.deleted_at IS NULL`, pageID,
	).Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &bgVid, &bgImg, &bgPos)
	if err != nil {
		return nil, err
	}
	if bgVid.Valid {
		u.BackgroundVideoURL = bgVid.String
	}
	if bgImg.Valid {
		u.BackgroundImageURL = bgImg.String
	}
	if bgPos.Valid {
		u.BackgroundPosition = bgPos.String
	}
	return u, nil
}

func (r *sqlRepository) IsEditor(pageID, userID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*)
		 FROM page_editors pe
		 JOIN pages p ON p.id=pe.page_id AND p.deleted_at IS NULL
		 WHERE pe.page_id=$1 AND pe.user_id=$2 AND pe.inactive_at IS NULL`,
		pageID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *sqlRepository) BrowsePages(options BrowseOptions) (*BrowseResult, error) {
	var cursorTime interface{}
	var cursorID int64
	if options.Cursor != nil {
		cursorTime = options.Cursor.UpdatedAt
		cursorID = options.Cursor.ID
	}

	rows, err := r.db.Query(
		`SELECT p.id, p.slug, p.title, p.description, p.visibility, p.owner_id,
		        p.created_at, p.updated_at,
		        u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
		 FROM pages p
		 LEFT JOIN users u ON u.id = p.owner_id
		 WHERE p.deleted_at IS NULL
		   AND ($1 OR p.visibility <> 'private' OR p.owner_id = $2 OR EXISTS (
		       SELECT 1 FROM page_editors pe
		       WHERE pe.page_id = p.id AND pe.user_id = $2 AND pe.inactive_at IS NULL
		   ))
		   AND ($3 = '' OR strpos(lower(p.title), lower($3)) > 0
		        OR strpos(lower(p.slug), lower($3)) > 0
		        OR strpos(lower(p.description), lower($3)) > 0)
		   AND ($4::timestamptz IS NULL OR p.updated_at < $4
		        OR (p.updated_at = $4 AND p.id < $5))
		 ORDER BY p.updated_at DESC, p.id DESC
		 LIMIT $6`,
		options.IsAdmin, options.ActorID, options.Query, cursorTime, cursorID, options.Limit+1,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pages := make([]*models.PageBrowseSummary, 0, options.Limit)
	for rows.Next() {
		page := &models.PageBrowseSummary{}
		var ownerID, ownerUserID sql.NullInt64
		var ownerUsername, ownerDisplayName, ownerAvatar sql.NullString
		if err := rows.Scan(
			&page.ID, &page.Slug, &page.Title, &page.Description, &page.Visibility,
			&ownerID, &page.CreatedAt, &page.UpdatedAt,
			&ownerUserID, &ownerUsername, &ownerDisplayName, &ownerAvatar,
		); err != nil {
			return nil, err
		}
		if ownerID.Valid {
			id := ownerID.Int64
			page.OwnerID = &id
		}
		if ownerUserID.Valid {
			page.Owner = &models.PageUser{
				ID:          ownerUserID.Int64,
				Username:    ownerUsername.String,
				DisplayName: ownerDisplayName.String,
				AvatarURL:   ownerAvatar.String,
			}
		}
		page.Editors = []*models.PageUser{}
		pages = append(pages, page)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	hasMore := len(pages) > options.Limit
	if hasMore {
		pages = pages[:options.Limit]
	}
	if len(pages) == 0 {
		return &BrowseResult{Pages: pages, HasMore: false}, nil
	}

	pageIDs := make([]int64, 0, len(pages))
	byID := make(map[int64]*models.PageBrowseSummary, len(pages))
	for _, page := range pages {
		pageIDs = append(pageIDs, page.ID)
		byID[page.ID] = page
	}
	editorRows, err := r.db.Query(
		`SELECT pe.page_id, u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
		 FROM page_editors pe
		 JOIN users u ON u.id = pe.user_id
		 WHERE pe.page_id = ANY($1) AND pe.inactive_at IS NULL
		 ORDER BY pe.page_id, pe.granted_at`,
		pq.Array(pageIDs),
	)
	if err != nil {
		return nil, err
	}
	defer editorRows.Close()
	for editorRows.Next() {
		var pageID int64
		editor := &models.PageUser{}
		if err := editorRows.Scan(&pageID, &editor.ID, &editor.Username, &editor.DisplayName, &editor.AvatarURL); err != nil {
			return nil, err
		}
		if page := byID[pageID]; page != nil {
			page.Editors = append(page.Editors, editor)
		}
	}
	if err := editorRows.Err(); err != nil {
		return nil, err
	}
	return &BrowseResult{Pages: pages, HasMore: hasMore}, nil
}

// engagement: likes, comments
func (r *sqlRepository) LikePage(pageID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`INSERT INTO page_likes (page_id, user_id, inactive_at, inactive_by)
		 SELECT $1, $2, NULL, NULL
		 WHERE EXISTS (SELECT 1 FROM pages WHERE id=$1 AND deleted_at IS NULL)
		 ON CONFLICT (page_id, user_id) DO UPDATE
		 SET inactive_at=NULL, inactive_by=NULL, created_at=CURRENT_TIMESTAMP`,
		pageID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM page_likes
		 WHERE page_id = $1 AND inactive_at IS NULL`,
		pageID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) UnlikePage(pageID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`UPDATE page_likes
		 SET inactive_at=COALESCE(inactive_at, NOW()), inactive_by=COALESCE(inactive_by, $2)
		 WHERE page_id=$1 AND user_id=$2 AND inactive_at IS NULL`,
		pageID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM page_likes
		 WHERE page_id = $1 AND inactive_at IS NULL`,
		pageID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) IsPageLikedByUser(pageID, userID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_likes
		 WHERE page_id=$1 AND user_id=$2 AND inactive_at IS NULL`,
		pageID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *sqlRepository) GetPageLikeCount(pageID int64) (int, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_likes
		 WHERE page_id=$1 AND inactive_at IS NULL`,
		pageID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) GetPageCommentCount(pageID int64) (int, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_comments
		 WHERE page_id=$1 AND deleted_at IS NULL`,
		pageID,
	).Scan(&count)
	return count, err
}

// page comments
func (r *sqlRepository) CreateComment(c *models.PageComment) (*models.PageComment, error) {
	err := r.db.QueryRow(
		`INSERT INTO page_comments (page_id, user_id, content)
		 SELECT $1, $2, $3
		 WHERE EXISTS (SELECT 1 FROM pages WHERE id=$1 AND deleted_at IS NULL)
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
		 FROM page_comments c
		 JOIN pages p ON p.id=c.page_id AND p.deleted_at IS NULL
		 JOIN users u ON u.id = c.user_id
		 WHERE c.id = $1 AND c.deleted_at IS NULL`, id,
	).Scan(&c.ID, &c.PageID, &c.UserID, &c.Content, &c.CreatedAt, &c.UpdatedAt,
		&c.AuthorName, &c.AuthorAvatar)
	return c, err
}

func (r *sqlRepository) ListComments(pageID int64, limit, offset int) ([]*models.PageComment, error) {
	rows, err := r.db.Query(
		`SELECT c.id, c.page_id, c.user_id, c.content, c.created_at, c.updated_at,
		        u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, ''),
		        (SELECT COUNT(*) FROM page_comment_likes WHERE page_comment_id = c.id AND inactive_at IS NULL)
		 FROM page_comments c
		 JOIN pages p ON p.id=c.page_id AND p.deleted_at IS NULL
		 JOIN users u ON u.id = c.user_id
		 WHERE c.page_id = $1 AND c.deleted_at IS NULL
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
		`UPDATE page_comments SET content = $2, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1 AND deleted_at IS NULL`,
		c.ID, c.Content)
	return err
}

func (r *sqlRepository) DeleteComment(id, actorID int64) error {
	_, err := r.db.Exec(
		`WITH changed AS (
		    UPDATE page_comments
		    SET deleted_at=COALESCE(deleted_at, NOW()),
		        deleted_by=COALESCE(deleted_by, $2)
		    WHERE id=$1 AND deleted_at IS NULL
		    RETURNING id
		 )
		 INSERT INTO resource_lifecycle_events(actor_id, resource_type, resource_id, action)
		 SELECT $2, 'page_comment', id::text, 'delete' FROM changed`,
		id, actorID,
	)
	return err
}

func (r *sqlRepository) LikeComment(commentID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`INSERT INTO page_comment_likes (page_comment_id, user_id, inactive_at, inactive_by)
		 SELECT $1, $2, NULL, NULL
		 FROM page_comments c
		 JOIN pages p ON p.id=c.page_id AND p.deleted_at IS NULL
		 WHERE c.id=$1 AND c.deleted_at IS NULL
		 ON CONFLICT (page_comment_id, user_id) DO UPDATE
		 SET inactive_at=NULL, inactive_by=NULL, created_at=CURRENT_TIMESTAMP`,
		commentID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM page_comment_likes
		 WHERE page_comment_id=$1 AND inactive_at IS NULL`,
		commentID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) UnlikeComment(commentID, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`UPDATE page_comment_likes
		 SET inactive_at=COALESCE(inactive_at, NOW()), inactive_by=COALESCE(inactive_by, $2)
		 WHERE page_comment_id=$1 AND user_id=$2 AND inactive_at IS NULL`,
		commentID, userID)
	if err != nil {
		return 0, err
	}
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM page_comment_likes
		 WHERE page_comment_id=$1 AND inactive_at IS NULL`,
		commentID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) IsCommentLikedByUser(commentID, userID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM page_comment_likes
		 WHERE page_comment_id=$1 AND user_id=$2 AND inactive_at IS NULL`,
		commentID, userID).Scan(&count)
	return count > 0, err
}

// page allocations
func (r *sqlRepository) GetAllocation(userID int64) (*models.UserPageAllocation, error) {
	a := &models.UserPageAllocation{}
	err := r.db.QueryRow(
		`SELECT a.id, a.user_id, a.max_pages, a.used_pages, a.created_at, a.updated_at,
		        u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, '')
		 FROM user_page_allocations a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.user_id=$1 AND a.deleted_at IS NULL AND u.deleted_at IS NULL`, userID,
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
		   SET max_pages=$2,deleted_at=NULL,deleted_by=NULL,updated_at=CURRENT_TIMESTAMP`,
		userID, maxPages)
	return err
}

func (r *sqlRepository) IncrementUsed(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE user_page_allocations
		 SET used_pages = used_pages + 1, updated_at = CURRENT_TIMESTAMP
		 WHERE user_id=$1 AND deleted_at IS NULL`, userID)
	return err
}

func (r *sqlRepository) DecrementUsed(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE user_page_allocations
		 SET used_pages = GREATEST(used_pages - 1, 0), updated_at = CURRENT_TIMESTAMP
		 WHERE user_id=$1 AND deleted_at IS NULL`, userID)
	return err
}

func (r *sqlRepository) ListAllocations() ([]*models.UserPageAllocation, error) {
	rows, err := r.db.Query(
		`SELECT a.id, a.user_id, a.max_pages, a.used_pages, a.created_at, a.updated_at,
		        u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, '')
		 FROM user_page_allocations a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.deleted_at IS NULL AND u.deleted_at IS NULL
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
	_, err := r.db.Exec(
		`WITH changed AS (
		    UPDATE user_page_allocations SET deleted_at=COALESCE(deleted_at,NOW())
		    WHERE user_id=$1 AND deleted_at IS NULL RETURNING id
		 )
		 INSERT INTO resource_lifecycle_events(resource_type,resource_id,action)
		 SELECT 'page_allocation',id::text,'delete' FROM changed`, userID)
	return err
}

func (r *sqlRepository) SetUsedPages(userID int64, count int) error {
	_, err := r.db.Exec(
		`UPDATE user_page_allocations SET used_pages=$2,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND deleted_at IS NULL`,
		userID, count)
	return err
}

func (r *sqlRepository) CountOwnedPages(userID int64) (int, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM pages WHERE owner_id=$1 AND deleted_at IS NULL`,
		userID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) GetNoreplyUserID() (int64, error) {
	var id int64
	err := r.db.QueryRow(`SELECT id FROM users WHERE username='noreply' AND deleted_at IS NULL LIMIT 1`).Scan(&id)
	return id, err
}
