// Package forum encapsulates the forum domain: categories, threads, and comments.
// Each sub-entity exposes its own Repository interface. The single Service
// orchestrates all three with caching, and Handler owns HTTP routing.
package forum

import "github.com/skaia/backend/models"

// CategoryRepository is the storage contract for forum categories.
type CategoryRepository interface {
	GetByID(id int64) (*models.ForumCategory, error)
	GetByName(name string) (*models.ForumCategory, error)
	Create(cat *models.ForumCategory) (*models.ForumCategory, error)
	Update(cat *models.ForumCategory) (*models.ForumCategory, error)
	Delete(id int64) error
	List() ([]*models.ForumCategory, error)
}

// ThreadRepository is the storage contract for forum threads.
type ThreadRepository interface {
	GetByID(id int64) (*models.ForumThread, error)
	GetByCategory(categoryID int64, limit, offset int) ([]*models.ForumThread, error)
	GetByUser(userID int64, limit, offset int) ([]*models.ForumThread, error)
	Create(thread *models.ForumThread) (*models.ForumThread, error)
	Update(thread *models.ForumThread) (*models.ForumThread, error)
	Delete(id int64) error
	Like(threadID, userID int64) (int64, error)
	Unlike(threadID, userID int64) (int64, error)
	IsLikedByUser(threadID, userID int64) (bool, error)
}

// CommentRepository is the storage contract for thread comments.
type CommentRepository interface {
	GetByID(id int64) (*models.ThreadComment, error)
	GetByThread(threadID int64, limit, offset int) ([]*models.ThreadComment, error)
	Create(comment *models.ThreadComment) (*models.ThreadComment, error)
	Update(comment *models.ThreadComment) (*models.ThreadComment, error)
	Delete(id int64) error
	Like(commentID, userID int64) (int64, error)
	Unlike(commentID, userID int64) (int64, error)
	IsLikedByUser(commentID, userID int64) (bool, error)
}
