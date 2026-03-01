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
			STRING_AGG(DISTINCT r.name, ',') as roles,
			COUNT(DISTINCT pl.id) as likes
		 FROM forum_posts fp
		 LEFT JOIN users u ON fp.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 LEFT JOIN post_likes pl ON fp.id = pl.post_id
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
		err = rows.Scan(&post.ID, &post.ThreadID, &post.UserID, &post.Content, &post.CreatedAt, &post.UpdatedAt,
			&post.AuthorName, &post.AuthorAvatar, &roles, &post.Likes)
		if err != nil {
			return nil, err
		}
		// Set AuthorID to match UserID
		post.AuthorID = post.UserID

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

// LikePost adds a like from a user to a post
func (r *ForumPostRepositoryImpl) LikePost(postID int64, userID int64) (int64, error) {
	// Insert like, ignore if already exists (UPSERT behavior via ON CONFLICT)
	_, err := r.db.Exec(
		`INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) 
		 ON CONFLICT DO NOTHING`,
		postID, userID,
	)
	if err != nil {
		return 0, err
	}

	// Get updated like count
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM post_likes WHERE post_id = $1`,
		postID,
	).Scan(&count)
	return count, err
}

// UnlikePost removes a like from a user on a post
func (r *ForumPostRepositoryImpl) UnlikePost(postID int64, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`,
		postID, userID,
	)
	if err != nil {
		return 0, err
	}

	// Get updated like count
	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM post_likes WHERE post_id = $1`,
		postID,
	).Scan(&count)
	return count, err
}

// IsPostLikedByUser checks if a user liked a post
func (r *ForumPostRepositoryImpl) IsPostLikedByUser(postID int64, userID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2)`,
		postID, userID,
	).Scan(&exists)
	return exists, err
}
