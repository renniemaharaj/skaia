package repository

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/skaia/backend/models"
)

type ThreadCommentRepositoryImpl struct {
	db *sql.DB
}

func NewThreadCommentRepository(db *sql.DB) ThreadCommentRepository {
	return &ThreadCommentRepositoryImpl{db: db}
}

func (r *ThreadCommentRepositoryImpl) GetThreadCommentByID(id int64) (*models.ThreadComment, error) {
	comment := &models.ThreadComment{}
	var roles sql.NullString
	err := r.db.QueryRow(
		`SELECT 
			tc.id, tc.thread_id, tc.user_id, tc.content, tc.created_at, tc.updated_at,
			u.username, u.avatar_url,
			STRING_AGG(DISTINCT r.name, ',') as roles
		 FROM thread_comments tc
		 LEFT JOIN users u ON tc.user_id = u.id
		 LEFT JOIN user_roles ur ON u.id = ur.user_id
		 LEFT JOIN roles r ON ur.role_id = r.id
		 WHERE tc.id = $1
		 GROUP BY tc.id, u.id, u.username, u.avatar_url`,
		id,
	).Scan(&comment.ID, &comment.ThreadID, &comment.UserID, &comment.Content, &comment.CreatedAt, &comment.UpdatedAt,
		&comment.AuthorName, &comment.AuthorAvatar, &roles)

	if err == sql.ErrNoRows {
		return nil, errors.New("comment not found")
	}
	if err != nil {
		return nil, err
	}

	if roles.Valid && roles.String != "" {
		comment.AuthorRoles = strings.Split(roles.String, ",")
	}

	return comment, err
}

func (r *ThreadCommentRepositoryImpl) GetThreadComments(threadID int64, limit int, offset int) ([]*models.ThreadComment, error) {
	rows, err := r.db.Query(
		`SELECT 
			tc.id, tc.thread_id, tc.user_id, tc.content, tc.created_at, tc.updated_at,
			u.username, u.avatar_url,
			STRING_AGG(DISTINCT r.name, ',') as roles,
			COUNT(DISTINCT tcl.id) as likes
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
		comment := &models.ThreadComment{}
		var roles sql.NullString
		err = rows.Scan(&comment.ID, &comment.ThreadID, &comment.UserID, &comment.Content, &comment.CreatedAt, &comment.UpdatedAt,
			&comment.AuthorName, &comment.AuthorAvatar, &roles, &comment.Likes)
		if err != nil {
			return nil, err
		}
		comment.AuthorID = comment.UserID

		if roles.Valid && roles.String != "" {
			comment.AuthorRoles = strings.Split(roles.String, ",")
		}

		comments = append(comments, comment)
	}

	return comments, rows.Err()
}

func (r *ThreadCommentRepositoryImpl) CreateThreadComment(comment *models.ThreadComment) (*models.ThreadComment, error) {
	err := r.db.QueryRow(
		`INSERT INTO thread_comments (thread_id, user_id, content)
		 VALUES ($1, $2, $3)
		 RETURNING id, thread_id, user_id, content, created_at, updated_at`,
		comment.ThreadID, comment.UserID, comment.Content,
	).Scan(&comment.ID, &comment.ThreadID, &comment.UserID, &comment.Content, &comment.CreatedAt, &comment.UpdatedAt)

	if err == nil {
		r.db.Exec(`UPDATE forum_threads SET reply_count = reply_count + 1 WHERE id = $1`, comment.ThreadID)
	}

	return comment, err
}

func (r *ThreadCommentRepositoryImpl) UpdateThreadComment(comment *models.ThreadComment) (*models.ThreadComment, error) {
	err := r.db.QueryRow(
		`UPDATE thread_comments SET content = $1, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $2
		 RETURNING id, thread_id, user_id, content, created_at, updated_at`,
		comment.Content, comment.ID,
	).Scan(&comment.ID, &comment.ThreadID, &comment.UserID, &comment.Content, &comment.CreatedAt, &comment.UpdatedAt)

	return comment, err
}

func (r *ThreadCommentRepositoryImpl) DeleteThreadComment(id int64) error {
	var threadID int64
	err := r.db.QueryRow(`SELECT thread_id FROM thread_comments WHERE id = $1`, id).Scan(&threadID)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(`DELETE FROM thread_comments WHERE id = $1`, id)
	if err == nil {
		r.db.Exec(`UPDATE forum_threads SET reply_count = reply_count - 1 WHERE id = $1`, threadID)
	}

	return err
}

// LikeThreadComment adds a like from a user to a thread comment
func (r *ThreadCommentRepositoryImpl) LikeThreadComment(commentID int64, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`INSERT INTO thread_comment_likes (thread_comment_id, user_id) VALUES ($1, $2) 
		 ON CONFLICT DO NOTHING`,
		commentID, userID,
	)
	if err != nil {
		return 0, err
	}

	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM thread_comment_likes WHERE thread_comment_id = $1`,
		commentID,
	).Scan(&count)
	return count, err
}

// UnlikeThreadComment removes a like from a user on a thread comment
func (r *ThreadCommentRepositoryImpl) UnlikeThreadComment(commentID int64, userID int64) (int64, error) {
	_, err := r.db.Exec(
		`DELETE FROM thread_comment_likes WHERE thread_comment_id = $1 AND user_id = $2`,
		commentID, userID,
	)
	if err != nil {
		return 0, err
	}

	var count int64
	err = r.db.QueryRow(
		`SELECT COUNT(*) FROM thread_comment_likes WHERE thread_comment_id = $1`,
		commentID,
	).Scan(&count)
	return count, err
}

// IsThreadCommentLikedByUser checks if a user liked a thread comment
func (r *ThreadCommentRepositoryImpl) IsThreadCommentLikedByUser(commentID int64, userID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM thread_comment_likes WHERE thread_comment_id = $1 AND user_id = $2)`,
		commentID, userID,
	).Scan(&exists)
	return exists, err
}
