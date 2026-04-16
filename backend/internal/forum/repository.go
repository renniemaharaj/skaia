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
		`SELECT id, name, description, display_order, is_locked, created_at FROM forum_categories WHERE id = $1`, id,
	).Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.IsLocked, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("category not found")
	}
	return c, err
}

func (r *sqlCategoryRepository) GetByName(name string) (*models.ForumCategory, error) {
	c := &models.ForumCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, is_locked, created_at FROM forum_categories WHERE name = $1`, name,
	).Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.IsLocked, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("category not found")
	}
	return c, err
}

func (r *sqlCategoryRepository) Create(cat *models.ForumCategory) (*models.ForumCategory, error) {
	err := r.db.QueryRow(
		`INSERT INTO forum_categories (name, description, display_order, is_locked)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, name, description, display_order, is_locked, created_at`,
		cat.Name, cat.Description, cat.DisplayOrder, cat.IsLocked,
	).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.DisplayOrder, &cat.IsLocked, &cat.CreatedAt)
	return cat, err
}

func (r *sqlCategoryRepository) Update(cat *models.ForumCategory) (*models.ForumCategory, error) {
	err := r.db.QueryRow(
		`UPDATE forum_categories SET name=$1, description=$2, display_order=$3, is_locked=$4
		 WHERE id=$5
		 RETURNING id, name, description, display_order, is_locked, created_at`,
		cat.Name, cat.Description, cat.DisplayOrder, cat.IsLocked, cat.ID,
	).Scan(&cat.ID, &cat.Name, &cat.Description, &cat.DisplayOrder, &cat.IsLocked, &cat.CreatedAt)
	return cat, err
}

func (r *sqlCategoryRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM forum_categories WHERE id = $1`, id)
	return err
}

func (r *sqlCategoryRepository) List() ([]*models.ForumCategory, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, display_order, is_locked, created_at FROM forum_categories ORDER BY display_order ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []*models.ForumCategory
	for rows.Next() {
		c := &models.ForumCategory{}
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.DisplayOrder, &c.IsLocked, &c.CreatedAt); err != nil {
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
	err := r.db.QueryRow(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        ft.view_count, ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url,
		        STRING_AGG(DISTINCT r.name, ',') AS roles,
		        COUNT(DISTINCT tl.id) AS likes
		 FROM forum_threads ft
		 LEFT JOIN users u ON ft.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 LEFT JOIN thread_likes tl ON ft.id = tl.thread_id
		 WHERE ft.id = $1
		 GROUP BY ft.id, u.id, u.username, u.avatar_url`, id,
	).Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
		&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
		&t.IsShared, &origID,
		&t.CreatedAt, &t.UpdatedAt,
		&t.UserName, &t.UserAvatar, &roles, &t.Likes)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("thread not found")
	}
	if err != nil {
		return nil, err
	}
	if origID.Valid {
		t.OriginalThreadID = &origID.Int64
	}
	if roles.Valid && roles.String != "" {
		t.UserRoles = strings.Split(roles.String, ",")
	}
	return t, nil
}

func (r *sqlThreadRepository) GetByCategory(categoryID int64, limit, offset int) ([]*models.ForumThread, error) {
	rows, err := r.db.Query(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        ft.view_count, ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url,
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
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
			&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
			&t.IsShared, &origID,
			&t.CreatedAt, &t.UpdatedAt,
			&t.UserName, &t.UserAvatar, &t.Likes); err != nil {
			return nil, err
		}
		if origID.Valid {
			t.OriginalThreadID = &origID.Int64
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

func (r *sqlThreadRepository) GetByUser(userID int64, limit, offset int) ([]*models.ForumThread, error) {
	rows, err := r.db.Query(
		`SELECT ft.id, ft.category_id, ft.user_id, ft.title, ft.content,
		        ft.view_count, ft.reply_count, ft.is_pinned, ft.is_locked,
		        ft.is_shared, ft.original_thread_id,
		        ft.created_at, ft.updated_at,
		        u.username, u.avatar_url,
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
		if err := rows.Scan(&t.ID, &t.CategoryID, &t.UserID, &t.Title, &t.Content,
			&t.ViewCount, &t.ReplyCount, &t.IsPinned, &t.IsLocked,
			&t.IsShared, &origID,
			&t.CreatedAt, &t.UpdatedAt,
			&t.UserName, &t.UserAvatar, &t.Likes); err != nil {
			return nil, err
		}
		if origID.Valid {
			t.OriginalThreadID = &origID.Int64
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
		           view_count, reply_count, is_pinned, is_locked, is_shared, original_thread_id, created_at, updated_at`,
		thread.CategoryID, thread.UserID, thread.Title, thread.Content, thread.IsPinned, thread.IsLocked, thread.IsShared, thread.OriginalThreadID,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content,
		&thread.ViewCount, &thread.ReplyCount, &thread.IsPinned, &thread.IsLocked,
		&thread.IsShared, &thread.OriginalThreadID,
		&thread.CreatedAt, &thread.UpdatedAt)
	return thread, err
}

func (r *sqlThreadRepository) Update(thread *models.ForumThread) (*models.ForumThread, error) {
	err := r.db.QueryRow(
		`UPDATE forum_threads
		 SET title=$1, content=$2, is_pinned=$3, is_locked=$4, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$5
		 RETURNING id, category_id, user_id, title, content,
		           view_count, reply_count, is_pinned, is_locked, is_shared, original_thread_id, created_at, updated_at`,
		thread.Title, thread.Content, thread.IsPinned, thread.IsLocked, thread.ID,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content,
		&thread.ViewCount, &thread.ReplyCount, &thread.IsPinned, &thread.IsLocked,
		&thread.IsShared, &thread.OriginalThreadID,
		&thread.CreatedAt, &thread.UpdatedAt)
	return thread, err
}

func (r *sqlThreadRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM forum_threads WHERE id = $1`, id)
	return err
}

func (r *sqlThreadRepository) IncrementViewCount(id int64) error {
	_, err := r.db.Exec(`UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1`, id)
	return err
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
