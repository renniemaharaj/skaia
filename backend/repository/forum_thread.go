package repository

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/skaia/backend/models"
)

type ForumThreadRepositoryImpl struct {
	db *sql.DB
}

func NewForumThreadRepository(db *sql.DB) ForumThreadRepository {
	return &ForumThreadRepositoryImpl{db: db}
}

func (r *ForumThreadRepositoryImpl) GetThreadByID(id int64) (*models.ForumThread, error) {
	thread := &models.ForumThread{}
	var roles sql.NullString
	err := r.db.QueryRow(
		`SELECT 
			ft.id, ft.category_id, ft.user_id, ft.title, ft.content, ft.view_count, 
			ft.reply_count, ft.is_pinned, ft.is_locked, ft.created_at, ft.updated_at,
			u.username, u.avatar_url,
			STRING_AGG(DISTINCT r.name, ',') as roles,
			COUNT(DISTINCT tl.id) as likes
		 FROM forum_threads ft
		 LEFT JOIN users u ON ft.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 LEFT JOIN thread_likes tl ON ft.id = tl.thread_id
		 WHERE ft.id = $1
		 GROUP BY ft.id, u.id, u.username, u.avatar_url`,
		id,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content, &thread.ViewCount,
		&thread.ReplyCount, &thread.IsPinned, &thread.IsLocked, &thread.CreatedAt, &thread.UpdatedAt,
		&thread.UserName, &thread.UserAvatar, &roles, &thread.Likes)

	if err == sql.ErrNoRows {
		return nil, errors.New("thread not found")
	}
	if err != nil {
		return nil, err
	}

	// Parse roles
	if roles.Valid && roles.String != "" {
		roleList := strings.Split(roles.String, ",")
		thread.UserRoles = roleList
	}

	return thread, nil
}

func (r *ForumThreadRepositoryImpl) GetCategoryThreads(categoryID int64, limit int, offset int) ([]*models.ForumThread, error) {
	rows, err := r.db.Query(
		`SELECT id, category_id, user_id, title, content, view_count, reply_count, is_pinned, is_locked, created_at, updated_at
		 FROM forum_threads WHERE category_id = $1
		 ORDER BY is_pinned DESC, created_at DESC
		 LIMIT $2 OFFSET $3`,
		categoryID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var threads []*models.ForumThread
	for rows.Next() {
		thread := &models.ForumThread{}
		err := rows.Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content, &thread.ViewCount, &thread.ReplyCount, &thread.IsPinned, &thread.IsLocked, &thread.CreatedAt, &thread.UpdatedAt)
		if err != nil {
			return nil, err
		}
		threads = append(threads, thread)
	}

	return threads, rows.Err()
}

func (r *ForumThreadRepositoryImpl) CreateThread(thread *models.ForumThread) (*models.ForumThread, error) {
	err := r.db.QueryRow(
		`INSERT INTO forum_threads (category_id, user_id, title, content, is_pinned, is_locked)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, category_id, user_id, title, content, view_count, reply_count, is_pinned, is_locked, created_at, updated_at`,
		thread.CategoryID, thread.UserID, thread.Title, thread.Content, thread.IsPinned, thread.IsLocked,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content, &thread.ViewCount, &thread.ReplyCount, &thread.IsPinned, &thread.IsLocked, &thread.CreatedAt, &thread.UpdatedAt)

	return thread, err
}

func (r *ForumThreadRepositoryImpl) UpdateThread(thread *models.ForumThread) (*models.ForumThread, error) {
	err := r.db.QueryRow(
		`UPDATE forum_threads SET title = $1, content = $2, is_pinned = $3, is_locked = $4, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $5
		 RETURNING id, category_id, user_id, title, content, view_count, reply_count, is_pinned, is_locked, created_at, updated_at`,
		thread.Title, thread.Content, thread.IsPinned, thread.IsLocked, thread.ID,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content, &thread.ViewCount, &thread.ReplyCount, &thread.IsPinned, &thread.IsLocked, &thread.CreatedAt, &thread.UpdatedAt)

	return thread, err
}

func (r *ForumThreadRepositoryImpl) DeleteThread(id int64) error {
	_, err := r.db.Exec(`DELETE FROM forum_threads WHERE id = $1`, id)
	return err
}

func (r *ForumThreadRepositoryImpl) IncrementViewCount(id int64) error {
	_, err := r.db.Exec(`UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1`, id)
	return err
}

// LikeThread adds a like from a user to a thread
func (r *ForumThreadRepositoryImpl) LikeThread(threadID int64, userID int64) (int64, error) {
	// Insert like, ignore if already exists (UPSERT behavior via ON CONFLICT)
	_, err := r.db.Exec(
		`INSERT INTO thread_likes (thread_id, user_id) VALUES ($1, $2) 
		 ON CONFLICT DO NOTHING`,
		threadID, userID,
	)
	if err != nil {
		return 0, err
	}

	// Get updated like count
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM thread_likes WHERE thread_id = $1`,
		threadID,
	).Scan(&count)
	return count, err
}

// UnlikeThread removes a like from a user on a thread
func (r *ForumThreadRepositoryImpl) UnlikeThread(threadID int64, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`DELETE FROM thread_likes WHERE thread_id = $1 AND user_id = $2`,
		threadID, userID,
	)
	if err != nil {
		return 0, err
	}

	// Get updated like count
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM thread_likes WHERE thread_id = $1`,
		threadID,
	).Scan(&count)
	return count, err
}

// IsThreadLikedByUser checks if a user liked a thread
func (r *ForumThreadRepositoryImpl) IsThreadLikedByUser(threadID int64, userID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM thread_likes WHERE thread_id = $1 AND user_id = $2)`,
		threadID, userID,
	).Scan(&exists)
	return exists, err
}
