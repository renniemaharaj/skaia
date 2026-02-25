package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type ForumPostRepositoryImpl struct {
	db *sql.DB
}

func NewForumPostRepository(db *sql.DB) ForumPostRepository {
	return &ForumPostRepositoryImpl{db: db}
}

func (r *ForumPostRepositoryImpl) GetPostByID(id uuid.UUID) (*models.ForumPost, error) {
	post := &models.ForumPost{}
	err := r.db.QueryRow(
		`SELECT id, thread_id, user_id, content, created_at, updated_at FROM forum_posts WHERE id = $1`,
		id,
	).Scan(&post.ID, &post.ThreadID, &post.UserID, &post.Content, &post.CreatedAt, &post.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("post not found")
	}
	return post, err
}

func (r *ForumPostRepositoryImpl) GetThreadPosts(threadID uuid.UUID, limit int, offset int) ([]*models.ForumPost, error) {
	rows, err := r.db.Query(
		`SELECT id, thread_id, user_id, content, created_at, updated_at
		 FROM forum_posts WHERE thread_id = $1
		 ORDER BY created_at ASC
		 LIMIT $2 OFFSET $3`,
		threadID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*models.ForumPost
	for rows.Next() {
		post := &models.ForumPost{}
		err := rows.Scan(&post.ID, &post.ThreadID, &post.UserID, &post.Content, &post.CreatedAt, &post.UpdatedAt)
		if err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}

	return posts, rows.Err()
}

func (r *ForumPostRepositoryImpl) CreatePost(post *models.ForumPost) (*models.ForumPost, error) {
	post.ID = uuid.New()

	err := r.db.QueryRow(
		`INSERT INTO forum_posts (id, thread_id, user_id, content)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, thread_id, user_id, content, created_at, updated_at`,
		post.ID, post.ThreadID, post.UserID, post.Content,
	).Scan(&post.ID, &post.ThreadID, &post.UserID, &post.Content, &post.CreatedAt, &post.UpdatedAt)

	if err == nil {
		// Increment reply count on the thread
		r.db.Exec(`UPDATE forum_threads SET reply_count = reply_count + 1 WHERE id = $1`, post.ThreadID)
	}

	return post, err
}

func (r *ForumPostRepositoryImpl) UpdatePost(post *models.ForumPost) (*models.ForumPost, error) {
	err := r.db.QueryRow(
		`UPDATE forum_posts SET content = $1, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $2
		 RETURNING id, thread_id, user_id, content, created_at, updated_at`,
		post.Content, post.ID,
	).Scan(&post.ID, &post.ThreadID, &post.UserID, &post.Content, &post.CreatedAt, &post.UpdatedAt)

	return post, err
}

func (r *ForumPostRepositoryImpl) DeletePost(id uuid.UUID) error {
	// Get thread_id before deleting
	var threadID uuid.UUID
	err := r.db.QueryRow(`SELECT thread_id FROM forum_posts WHERE id = $1`, id).Scan(&threadID)
	if err != nil {
		return err
	}

	// Delete the post
	_, err = r.db.Exec(`DELETE FROM forum_posts WHERE id = $1`, id)
	if err == nil {
		// Decrement reply count
		r.db.Exec(`UPDATE forum_threads SET reply_count = reply_count - 1 WHERE id = $1`, threadID)
	}

	return err
}
