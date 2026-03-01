package repository

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/skaia/backend/models"
)

type ForumPostRepositoryImpl struct {
	db *sql.DB
}

func NewForumPostRepository(db *sql.DB) ForumPostRepository {
	return &ForumPostRepositoryImpl{db: db}
}

func (r *ForumPostRepositoryImpl) GetPostByID(id int64) (*models.ForumPost, error) {
	post := &models.ForumPost{}
	var roles sql.NullString
	err := r.db.QueryRow(
		`SELECT 
			fp.id, fp.thread_id, fp.user_id, fp.content, fp.created_at, fp.updated_at,
			u.username, u.avatar_url,
			STRING_AGG(DISTINCT r.name, ',') as roles
		 FROM forum_posts fp
		 LEFT JOIN users u ON fp.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 WHERE fp.id = $1
		 GROUP BY fp.id, u.id, u.username, u.avatar_url`,
		id,
	).Scan(&post.ID, &post.ThreadID, &post.UserID, &post.Content, &post.CreatedAt, &post.UpdatedAt,
		&post.AuthorName, &post.AuthorAvatar, &roles)

	if err == sql.ErrNoRows {
		return nil, errors.New("post not found")
	}
	if err != nil {
		return nil, err
	}

	// Parse roles
	if roles.Valid && roles.String != "" {
		roleList := strings.Split(roles.String, ",")
		post.AuthorRoles = roleList
	}

	return post, err
}

func (r *ForumPostRepositoryImpl) GetThreadPosts(threadID int64, limit int, offset int) ([]*models.ForumPost, error) {
	rows, err := r.db.Query(
		`SELECT 
			fp.id, fp.thread_id, fp.user_id, fp.content, fp.created_at, fp.updated_at,
			u.username, u.avatar_url,
			STRING_AGG(DISTINCT r.name, ',') as roles
		 FROM forum_posts fp
		 LEFT JOIN users u ON fp.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 WHERE fp.thread_id = $1
		 GROUP BY fp.id, u.id, u.username, u.avatar_url
		 ORDER BY fp.created_at ASC
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
		var roles sql.NullString
		err := rows.Scan(&post.ID, &post.ThreadID, &post.UserID, &post.Content, &post.CreatedAt, &post.UpdatedAt,
			&post.AuthorName, &post.AuthorAvatar, &roles)
		if err != nil {
			return nil, err
		}

		// Parse roles
		if roles.Valid && roles.String != "" {
			roleList := strings.Split(roles.String, ",")
			post.AuthorRoles = roleList
		}

		posts = append(posts, post)
	}

	return posts, rows.Err()
}

func (r *ForumPostRepositoryImpl) CreatePost(post *models.ForumPost) (*models.ForumPost, error) {

	err := r.db.QueryRow(
		`INSERT INTO forum_posts (thread_id, user_id, content)
		 VALUES ($1, $2, $3)
		 RETURNING id, thread_id, user_id, content, created_at, updated_at`,
		post.ThreadID, post.UserID, post.Content,
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

func (r *ForumPostRepositoryImpl) DeletePost(id int64) error {
	// Get thread_id before deleting
	var threadID int64
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
