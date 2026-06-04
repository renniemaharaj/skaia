package forum

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/skaia/backend/models"
)

// Category repository

type sqlCategoryRepository struct{ db *sql.DB }

func NewCategoryRepository(db *sql.DB) CategoryRepository {
	return &sqlCategoryRepository{db: db}
}

func (r *sqlCategoryRepository) GetByID(id int64) (*models.ForumCategory, error) {
	c := &models.ForumCategory{}
	err := r.db.QueryRow(
		`SELECT c.id, c.name, c.description, c.display_order, c.is_pinned, c.is_locked, c.created_at,
		        (SELECT COUNT(*) FROM forum_threads WHERE category_id = c.id) as thread_count
		 FROM forum_categories c WHERE c.id = $1`, id,
	).Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.IsPinned, &c.IsLocked, &c.CreatedAt, &c.ThreadCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("category not found")
	}
	return c, err
}

func (r *sqlCategoryRepository) GetByName(name string) (*models.ForumCategory, error) {
	c := &models.ForumCategory{}
	err := r.db.QueryRow(
		`SELECT c.id, c.name, c.description, c.display_order, c.is_pinned, c.is_locked, c.created_at,
		        (SELECT COUNT(*) FROM forum_threads WHERE category_id = c.id) as thread_count
		 FROM forum_categories c WHERE c.name = $1`, name,
	).Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.IsPinned, &c.IsLocked, &c.CreatedAt, &c.ThreadCount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("category not found")
	}
	return c, err
}

func (r *sqlCategoryRepository) Create(cat *models.ForumCategory) (*models.ForumCategory, error) {
	err := r.db.QueryRow(
		`INSERT INTO forum_categories (name, description, display_order, is_pinned, is_locked)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, description, display_order, is_pinned, is_locked, created_at`,
		cat.Name, cat.Description, cat.DisplayOrder, cat.IsPinned, cat.IsLocked,
	).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.DisplayOrder, &cat.IsPinned, &cat.IsLocked, &cat.CreatedAt)
	cat.ThreadCount = 0
	return cat, err
}

func (r *sqlCategoryRepository) Update(cat *models.ForumCategory) (*models.ForumCategory, error) {
	err := r.db.QueryRow(
		`UPDATE forum_categories SET name=$1, description=$2, display_order=$3, is_pinned=$4, is_locked=$5
		 WHERE id=$6
		 RETURNING id, name, description, display_order, is_pinned, is_locked, created_at`,
		cat.Name, cat.Description, cat.DisplayOrder, cat.IsPinned, cat.IsLocked, cat.ID,
	).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.DisplayOrder, &cat.IsPinned, &cat.IsLocked, &cat.CreatedAt)
	// Fetch thread count since we're returning the updated struct
	if err == nil {
		r.db.QueryRow(`SELECT COUNT(*) FROM forum_threads WHERE category_id = $1`, cat.ID).Scan(&cat.ThreadCount)
	}
	return cat, err
}

func (r *sqlCategoryRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM forum_categories WHERE id = $1`, id)
	return err
}

func (r *sqlCategoryRepository) List() ([]*models.ForumCategory, error) {
	rows, err := r.db.Query(
		`SELECT c.id, c.name, c.description, c.display_order, c.is_pinned, c.is_locked, c.created_at,
		        (SELECT COUNT(*) FROM forum_threads WHERE category_id = c.id) as thread_count
		 FROM forum_categories c ORDER BY c.is_pinned DESC, c.display_order ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []*models.ForumCategory
	for rows.Next() {
		c := &models.ForumCategory{}
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.IsPinned, &c.IsLocked, &c.CreatedAt, &c.ThreadCount); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

func (r *sqlCategoryRepository) Search(query string) ([]*models.ForumCategory, error) {
	searchPattern := "%" + query + "%"
	rows, err := r.db.Query(
		`SELECT c.id, c.name, c.description, c.display_order, c.is_pinned, c.is_locked, c.created_at,
		        (SELECT COUNT(*) FROM forum_threads WHERE category_id = c.id) as thread_count
		 FROM forum_categories c WHERE c.name ILIKE $1 ORDER BY c.is_pinned DESC, c.display_order ASC`,
		searchPattern,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []*models.ForumCategory
	for rows.Next() {
		c := &models.ForumCategory{}
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.IsLocked, &c.CreatedAt, &c.ThreadCount); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

// Thread repository

type sqlThreadRepository struct{ db *sql.DB }

func NewThreadRepository(db *sql.DB) ThreadRepository {
	return &sqlThreadRepository{db: db}
}

func (r *sqlThreadRepository) GetByID(id int64) (*models.ForumThread, error) {
	t := &models.ForumThread{}
	var roles sql.NullString
	var origID sql.NullInt64
	var bgVideo, bgImage, bgPos sql.NullString
	var lastEditedBy sql.NullInt64
	var lastEditedAvatar, lastEditedName sql.NullString
	err := r.db.QueryRow(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='thread' AND resource_id=ft.id), 0) AS view_count,
		        ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url, u.background_video_url, u.background_image_url, u.background_position,
		        STRING_AGG(DISTINCT r.name, ',') AS roles,
		        COUNT(DISTINCT tl.id) AS likes,
				ft.last_edited_by, editor.avatar_url, COALESCE(editor.display_name, editor.username)
		 FROM forum_threads ft
		 LEFT JOIN users u ON ft.user_id = u.id
		 LEFT JOIN users editor ON ft.last_edited_by = editor.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 LEFT JOIN thread_likes tl ON ft.id = tl.thread_id
		 WHERE ft.id = $1
		 GROUP BY ft.id, u.id, u.username, u.avatar_url, u.background_video_url, u.background_image_url, u.background_position, editor.id`, id,
	).Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
		&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
		&t.IsShared, &origID,
		&t.CreatedAt, &t.UpdatedAt,
		&t.UserName, &t.UserAvatar, &bgVideo, &bgImage, &bgPos, &roles, &t.Likes, &lastEditedBy, &lastEditedAvatar, &lastEditedName)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("thread not found")
	}
	if err != nil {
		return nil, err
	}
	if origID.Valid {
		t.OriginalThreadID = &origID.Int64
	}
	if bgVideo.Valid {
		t.UserBackgroundVideoURL = bgVideo.String
	}
	if bgImage.Valid {
		t.UserBackgroundImageURL = bgImage.String
	}
	if bgPos.Valid {
		t.UserBackgroundPosition = bgPos.String
	}
	if roles.Valid && roles.String != "" {
		t.UserRoles = strings.Split(roles.String, ",")
	}
	if lastEditedBy.Valid {
		t.LastEditedBy = &lastEditedBy.Int64
	}
	if lastEditedAvatar.Valid {
		t.LastEditedByAvatar = lastEditedAvatar.String
	}
	if lastEditedName.Valid {
		t.LastEditedByName = lastEditedName.String
	}
	return t, nil
}

func (r *sqlThreadRepository) GetByCategory(categoryID int64, limit, offset int) ([]*models.ForumThread, error) {
	rows, err := r.db.Query(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='thread' AND resource_id=ft.id), 0) AS view_count,
		        ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url, u.background_video_url, u.background_image_url, u.background_position,
		        COUNT(DISTINCT tl.id) AS likes
		 FROM forum_threads ft
		 LEFT JOIN users u ON ft.user_id = u.id
		 LEFT JOIN thread_likes tl ON ft.id = tl.thread_id
		 WHERE ft.category_id = $1
		 GROUP BY ft.id, u.id, u.username, u.avatar_url
		 ORDER BY ft.is_pinned DESC, ft.created_at DESC
		 LIMIT $2 OFFSET $3`,
		categoryID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []*models.ForumThread
	for rows.Next() {
		t := &models.ForumThread{}
		var origID sql.NullInt64
		var bgVideo, bgImage, bgPos sql.NullString
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
			&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
			&t.IsShared, &origID,
			&t.CreatedAt, &t.UpdatedAt,
			&t.UserName, &t.UserAvatar, &bgVideo, &bgImage, &bgPos, &t.Likes); err != nil {
			return nil, err
		}
		if origID.Valid {
			t.OriginalThreadID = &origID.Int64
		}
		if bgVideo.Valid {
			t.UserBackgroundVideoURL = bgVideo.String
		}
		if bgImage.Valid {
			t.UserBackgroundImageURL = bgImage.String
		}
		if bgPos.Valid {
			t.UserBackgroundPosition = bgPos.String
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

func (r *sqlThreadRepository) GetAll(limit, offset int) ([]*models.ForumThread, error) {
	rows, err := r.db.Query(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='thread' AND resource_id=ft.id), 0) AS view_count,
		        ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url, u.background_video_url, u.background_image_url, u.background_position,
		        COUNT(DISTINCT tl.id) AS likes
		 FROM forum_threads ft
		 LEFT JOIN users u ON ft.user_id = u.id
		 LEFT JOIN thread_likes tl ON ft.id = tl.thread_id
		 GROUP BY ft.id, u.id, u.username, u.avatar_url
		 ORDER BY ft.is_pinned DESC, ft.created_at DESC
		 LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []*models.ForumThread
	for rows.Next() {
		t := &models.ForumThread{}
		var origID sql.NullInt64
		var bgVideo, bgImage, bgPos sql.NullString
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
			&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
			&t.IsShared, &origID,
			&t.CreatedAt, &t.UpdatedAt,
			&t.UserName, &t.UserAvatar, &bgVideo, &bgImage, &bgPos, &t.Likes); err != nil {
			return nil, err
		}
		if origID.Valid {
			t.OriginalThreadID = &origID.Int64
		}
		if bgVideo.Valid {
			t.UserBackgroundVideoURL = bgVideo.String
		}
		if bgImage.Valid {
			t.UserBackgroundImageURL = bgImage.String
		}
		if bgPos.Valid {
			t.UserBackgroundPosition = bgPos.String
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

func (r *sqlThreadRepository) GetByUser(userID int64, limit, offset int) ([]*models.ForumThread, error) {
	rows, err := r.db.Query(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='thread' AND resource_id=ft.id), 0) AS view_count,
		        ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url, u.background_video_url, u.background_image_url, u.background_position,
		        COUNT(DISTINCT tl.id) AS likes
		 FROM forum_threads ft
		 LEFT JOIN users u ON ft.user_id = u.id
		 LEFT JOIN thread_likes tl ON ft.id = tl.thread_id
		 WHERE ft.user_id = $1
		 GROUP BY ft.id, u.id, u.username, u.avatar_url
		 ORDER BY ft.created_at DESC
		 LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []*models.ForumThread
	for rows.Next() {
		t := &models.ForumThread{}
		var origID sql.NullInt64
		var bgVideo, bgImage, bgPos sql.NullString
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
			&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
			&t.IsShared, &origID,
			&t.CreatedAt, &t.UpdatedAt,
			&t.UserName, &t.UserAvatar, &bgVideo, &bgImage, &bgPos, &t.Likes); err != nil {
			return nil, err
		}
		if origID.Valid {
			t.OriginalThreadID = &origID.Int64
		}
		if bgVideo.Valid {
			t.UserBackgroundVideoURL = bgVideo.String
		}
		if bgImage.Valid {
			t.UserBackgroundImageURL = bgImage.String
		}
		if bgPos.Valid {
			t.UserBackgroundPosition = bgPos.String
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

func (r *sqlThreadRepository) Create(thread *models.ForumThread) (*models.ForumThread, error) {
	err := r.db.QueryRow(
		`INSERT INTO forum_threads (category_id, user_id, title, content, is_pinned, is_locked, is_shared, original_thread_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, category_id, user_id, title, content,
		           reply_count, is_pinned, is_locked, is_shared, original_thread_id, created_at, updated_at`,
		thread.CategoryID, thread.UserID, thread.Title, thread.Content, thread.IsPinned, thread.IsLocked, thread.IsShared, thread.OriginalThreadID,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content,
		&thread.ReplyCount, &thread.IsPinned, &thread.IsLocked,
		&thread.IsShared, &thread.OriginalThreadID,
		&thread.CreatedAt, &thread.UpdatedAt)
	thread.ViewCount = 0
	return thread, err
}

func (r *sqlThreadRepository) Update(thread *models.ForumThread) (*models.ForumThread, error) {
	var vc int
	err := r.db.QueryRow(
		`UPDATE forum_threads
		 SET title=$1, content=$2, is_pinned=$3, is_locked=$4, category_id=$5, updated_at=CURRENT_TIMESTAMP, last_edited_by=$6
		 WHERE id=$7
		 RETURNING id, category_id, user_id, title, content,
		           COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='thread' AND resource_id=forum_threads.id), 0),
		           reply_count, is_pinned, is_locked, is_shared, original_thread_id, created_at, updated_at, last_edited_by`,
		thread.Title, thread.Content, thread.IsPinned, thread.IsLocked, thread.CategoryID, thread.LastEditedBy, thread.ID,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content,
		&vc, &thread.ReplyCount, &thread.IsPinned, &thread.IsLocked,
		&thread.IsShared, &thread.OriginalThreadID,
		&thread.CreatedAt, &thread.UpdatedAt, &thread.LastEditedBy)
	thread.ViewCount = vc
	
	if err == nil && thread.LastEditedBy != nil {
		r.db.Exec(`INSERT INTO thread_editors (thread_id, user_id) VALUES ($1, $2) ON CONFLICT(thread_id, user_id) DO UPDATE SET edited_at = CURRENT_TIMESTAMP`, thread.ID, *thread.LastEditedBy)
	}

	return thread, err
}

func (r *sqlThreadRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM forum_threads WHERE id = $1`, id)
	return err
}

func (r *sqlThreadRepository) Search(query string, limit, offset int) ([]*models.ForumThread, error) {
	searchPattern := "%" + query + "%"
	rows, err := r.db.Query(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        COALESCE((SELECT COUNT(*) FROM resource_views WHERE resource='thread' AND resource_id=ft.id), 0) AS view_count,
		        ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url, u.background_video_url, u.background_image_url, u.background_position,
		        COUNT(DISTINCT tl.id) AS likes
		 FROM forum_threads ft
		 LEFT JOIN users u ON ft.user_id = u.id
		 LEFT JOIN thread_likes tl ON ft.id = tl.thread_id
		 WHERE ft.title ILIKE $1
		 GROUP BY ft.id, u.id, u.username, u.avatar_url
		 ORDER BY ft.is_pinned DESC, ft.created_at DESC
		 LIMIT $2 OFFSET $3`,
		searchPattern, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []*models.ForumThread
	for rows.Next() {
		t := &models.ForumThread{}
		var origID sql.NullInt64
		var bgVideo, bgImage, bgPos sql.NullString
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
			&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
			&t.IsShared, &origID,
			&t.CreatedAt, &t.UpdatedAt,
			&t.UserName, &t.UserAvatar, &bgVideo, &bgImage, &bgPos, &t.Likes); err != nil {
			return nil, err
		}
		if origID.Valid {
			t.OriginalThreadID = &origID.Int64
		}
		if bgVideo.Valid {
			t.UserBackgroundVideoURL = bgVideo.String
		}
		if bgImage.Valid {
			t.UserBackgroundImageURL = bgImage.String
		}
		if bgPos.Valid {
			t.UserBackgroundPosition = bgPos.String
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

func (r *sqlThreadRepository) Like(threadID, userID int64) (int64, error) {
	if _, err := r.db.Exec(
		`INSERT INTO thread_likes (thread_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		threadID, userID,
	); err != nil {
		return 0, err
	}
	var count int64
	err := r.db.QueryRow(`SELECT COUNT(*) FROM thread_likes WHERE thread_id = $1`, threadID).Scan(&count)
	return count, err
}

func (r *sqlThreadRepository) Unlike(threadID, userID int64) (int64, error) {
	if _, err := r.db.Exec(
		`DELETE FROM thread_likes WHERE thread_id = $1 AND user_id = $2`, threadID, userID,
	); err != nil {
		return 0, err
	}
	var count int64
	err := r.db.QueryRow(`SELECT COUNT(*) FROM thread_likes WHERE thread_id = $1`, threadID).Scan(&count)
	return count, err
}

func (r *sqlThreadRepository) IsLikedByUser(threadID, userID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM thread_likes WHERE thread_id = $1 AND user_id = $2)`,
		threadID, userID,
	).Scan(&exists)
	return exists, err
}

func (r *sqlThreadRepository) GetThreadLikers(threadID int64, limit, offset int) ([]*models.User, error) {
	rows, err := r.db.Query(
		`SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.is_suspended, u.created_at
		 FROM users u
		 JOIN thread_likes tl ON u.id = tl.user_id
		 WHERE tl.thread_id = $1
		 ORDER BY tl.created_at DESC
		 LIMIT $2 OFFSET $3`,
		threadID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var likers []*models.User
	for rows.Next() {
		u := &models.User{}
		var avatar sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &avatar, &u.IsSuspended, &u.CreatedAt); err != nil {
			return nil, err
		}
		if avatar.Valid {
			u.AvatarURL = avatar.String
		}
		likers = append(likers, u)
	}
	return likers, rows.Err()
}

func (r *sqlThreadRepository) GetThreadViewers(threadID int64, limit, offset int) ([]*models.User, error) {
	rows, err := r.db.Query(
		`SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.is_suspended, u.created_at
		 FROM users u
		 JOIN (
		     SELECT user_id, MAX(created_at) as last_viewed
		     FROM resource_views
		     WHERE resource='thread' AND resource_id=$1 AND user_id IS NOT NULL
		     GROUP BY user_id
		 ) rv ON u.id = rv.user_id
		 ORDER BY rv.last_viewed DESC
		 LIMIT $2 OFFSET $3`,
		threadID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var viewers []*models.User
	for rows.Next() {
		u := &models.User{}
		var avatar sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &avatar, &u.IsSuspended, &u.CreatedAt); err != nil {
			return nil, err
		}
		if avatar.Valid {
			u.AvatarURL = avatar.String
		}
		viewers = append(viewers, u)
	}
	return viewers, rows.Err()
}

func (r *sqlThreadRepository) GetThreadContributorsUsers(threadID int64, limit, offset int) ([]*models.User, error) {
	rows, err := r.db.Query(
		`SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.is_suspended, u.created_at
		 FROM users u
		 JOIN (
		     SELECT user_id, MAX(ts) as last_activity
		     FROM (
		         SELECT user_id, created_at as ts FROM thread_comments WHERE thread_id=$1 AND user_id IS NOT NULL
		         UNION ALL
		         SELECT user_id, edited_at as ts FROM thread_editors WHERE thread_id=$1
		     ) combined
		     GROUP BY user_id
		 ) tc ON u.id = tc.user_id
		 ORDER BY tc.last_activity DESC
		 LIMIT $2 OFFSET $3`,
		threadID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u := &models.User{}
		var avatar sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &avatar, &u.IsSuspended, &u.CreatedAt); err != nil {
			return nil, err
		}
		if avatar.Valid {
			u.AvatarURL = avatar.String
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// Comment repository

type sqlCommentRepository struct{ db *sql.DB }

func NewCommentRepository(db *sql.DB) CommentRepository {
	return &sqlCommentRepository{db: db}
}

func (r *sqlCommentRepository) GetByID(id int64) (*models.ThreadComment, error) {
	c := &models.ThreadComment{}
	var roles sql.NullString
	err := r.db.QueryRow(
		`SELECT tc.id, tc.thread_id, tc.user_id, tc.content, tc.created_at, tc.updated_at,
		        u.username, u.avatar_url,
		        STRING_AGG(DISTINCT r.name, ',') AS roles
		 FROM thread_comments tc
		 LEFT JOIN users u ON tc.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 WHERE tc.id = $1
		 GROUP BY tc.id, u.id, u.username, u.avatar_url`, id,
	).Scan(&c.ID, &c.ThreadID, &c.AuthorID, &c.Content, &c.CreatedAt, &c.UpdatedAt,
		&c.AuthorName, &c.AuthorAvatar, &roles)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("comment not found")
	}
	if err != nil {
		return nil, err
	}
	if roles.Valid && roles.String != "" {
		c.AuthorRoles = strings.Split(roles.String, ",")
	}
	return c, nil
}

func (r *sqlCommentRepository) GetByThread(threadID int64, limit, offset int) ([]*models.ThreadComment, error) {
	rows, err := r.db.Query(
		`SELECT tc.id, tc.thread_id, tc.user_id, tc.content, tc.created_at, tc.updated_at,
		        u.username, u.avatar_url,
		        STRING_AGG(DISTINCT r.name, ',') AS roles,
		        COUNT(DISTINCT tcl.id) AS likes
		 FROM thread_comments tc
		 LEFT JOIN users u ON tc.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 LEFT JOIN thread_comment_likes tcl ON tc.id = tcl.thread_comment_id
		 WHERE tc.thread_id = $1
		 GROUP BY tc.id, u.id, u.username, u.avatar_url
		 ORDER BY tc.created_at ASC
		 LIMIT $2 OFFSET $3`,
		threadID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*models.ThreadComment
	for rows.Next() {
		c := &models.ThreadComment{}
		var roles sql.NullString
		if err := rows.Scan(&c.ID, &c.ThreadID, &c.AuthorID, &c.Content, &c.CreatedAt, &c.UpdatedAt,
			&c.AuthorName, &c.AuthorAvatar, &roles, &c.Likes); err != nil {
			return nil, err
		}
		if roles.Valid && roles.String != "" {
			c.AuthorRoles = strings.Split(roles.String, ",")
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

func (r *sqlCommentRepository) GetThreadContributors(threadID int64) ([]int64, error) {
	rows, err := r.db.Query(`SELECT DISTINCT user_id FROM thread_comments WHERE thread_id = $1 AND user_id IS NOT NULL`, threadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []int64
	for rows.Next() {
		var uid int64
		if err := rows.Scan(&uid); err == nil {
			users = append(users, uid)
		}
	}
	return users, rows.Err()
}

func (r *sqlCommentRepository) Create(comment *models.ThreadComment) (*models.ThreadComment, error) {
	err := r.db.QueryRow(
		`INSERT INTO thread_comments (thread_id, user_id, content)
		 VALUES ($1, $2, $3)
		 RETURNING id, thread_id, user_id, content, created_at, updated_at`,
		comment.ThreadID, comment.AuthorID, comment.Content,
	).Scan(&comment.ID, &comment.ThreadID, &comment.AuthorID, &comment.Content,
		&comment.CreatedAt, &comment.UpdatedAt)
	if err == nil {
		_, _ = r.db.Exec(`UPDATE forum_threads SET reply_count = reply_count + 1 WHERE id = $1`, comment.ThreadID)
	}
	return comment, err
}

func (r *sqlCommentRepository) Update(comment *models.ThreadComment) (*models.ThreadComment, error) {
	err := r.db.QueryRow(
		`UPDATE thread_comments SET content=$1, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$2
		 RETURNING id, thread_id, user_id, content, created_at, updated_at`,
		comment.Content, comment.ID,
	).Scan(&comment.ID, &comment.ThreadID, &comment.AuthorID, &comment.Content,
		&comment.CreatedAt, &comment.UpdatedAt)
	return comment, err
}

func (r *sqlCommentRepository) Delete(id int64) error {
	var threadID int64
	if err := r.db.QueryRow(`SELECT thread_id FROM thread_comments WHERE id = $1`, id).Scan(&threadID); err != nil {
		return err
	}
	if _, err := r.db.Exec(`DELETE FROM thread_comments WHERE id = $1`, id); err != nil {
		return err
	}
	_, _ = r.db.Exec(`UPDATE forum_threads SET reply_count = reply_count - 1 WHERE id = $1`, threadID)
	return nil
}

func (r *sqlCommentRepository) Like(commentID, userID int64) (int64, error) {
	if _, err := r.db.Exec(
		`INSERT INTO thread_comment_likes (thread_comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		commentID, userID,
	); err != nil {
		return 0, err
	}
	var count int64
	err := r.db.QueryRow(`SELECT COUNT(*) FROM thread_comment_likes WHERE thread_comment_id = $1`, commentID).Scan(&count)
	return count, err
}

func (r *sqlCommentRepository) Unlike(commentID, userID int64) (int64, error) {
	if _, err := r.db.Exec(
		`DELETE FROM thread_comment_likes WHERE thread_comment_id = $1 AND user_id = $2`,
		commentID, userID,
	); err != nil {
		return 0, err
	}
	var count int64
	err := r.db.QueryRow(`SELECT COUNT(*) FROM thread_comment_likes WHERE thread_comment_id = $1`, commentID).Scan(&count)
	return count, err
}

func (r *sqlCommentRepository) IsLikedByUser(commentID, userID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM thread_comment_likes WHERE thread_comment_id = $1 AND user_id = $2)`,
		commentID, userID,
	).Scan(&exists)
	return exists, err
}
