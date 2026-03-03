// Package notification manages user notifications: creation, retrieval, and deletion.
package notification

import "github.com/skaia/backend/models"

// Repository is the storage contract for the notification domain.
type Repository interface {
	Create(n *models.Notification) (*models.Notification, error)
	GetByUser(userID int64, limit, offset int) ([]*models.Notification, error)
	MarkRead(id, userID int64) error
	MarkAllRead(userID int64) error
	Delete(id, userID int64) error
	DeleteAll(userID int64) error
	UnreadCount(userID int64) (int, error)
}
