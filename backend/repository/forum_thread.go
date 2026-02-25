package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type ForumThreadRepositoryImpl struct {
	db *sql.DB
}

func NewForumThreadRepository(db *sql.DB) ForumThreadRepository {
	return &ForumThreadRepositoryImpl{db: db}
}

func (r *ForumThreadRepositoryImpl) GetThreadByID(id uuid.UUID) (*models.ForumThread, error) {
	thread := &models.ForumThread{}
	err := r.db.QueryRow(
		`SELECT id, category_id, user_id, title, content, view_count, reply_count, is_pinned, is_locked, created_at, updated_at
		 FROM forum_threads WHERE id = $1`,
		id,
	).Scan(&thread.ID, &thread.CategoryID, &thread.UserID, &thread.Title, &thread.Content, &thread.ViewCount, &thread.ReplyCount, &thread.IsPinned, &thread.IsLocked, &thread.CreatedAt, &thread.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("thread not found")
	}
	return thread, err
}

func (r *ForumThreadRepositoryImpl) GetCategoryThreads(categoryID uuid.UUID, limit int, offset int) ([]*models.ForumThread, error) {
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
	thread.ID = uuid.New()

	err := r.db.QueryRow(
		`INSERT INTO forum_threads (id, category_id, user_id, title, content, is_pinned, is_locked)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, category_id, user_id, title, content, view_count, reply_count, is_pinned, is_locked, created_at, updated_at`,
		thread.ID, thread.CategoryID, thread.UserID, thread.Title, thread.Content, thread.IsPinned, thread.IsLocked,
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

func (r *ForumThreadRepositoryImpl) DeleteThread(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM forum_threads WHERE id = $1`, id)
	return err
}

func (r *ForumThreadRepositoryImpl) IncrementViewCount(id uuid.UUID) error {
	_, err := r.db.Exec(`UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1`, id)
	return err
}
