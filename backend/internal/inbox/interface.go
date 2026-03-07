// Package inbox provides private direct messaging between authenticated users.
package inbox

import "github.com/skaia/backend/models"

// Repository is the storage contract for the inbox domain.
type Repository interface {
	// Conversations
	GetConversation(id int64) (*models.InboxConversation, error)
	GetConversationBetween(user1ID, user2ID int64) (*models.InboxConversation, error)
	GetOrCreateConversation(user1ID, user2ID int64) (*models.InboxConversation, error)
	ListConversations(userID int64) ([]*models.InboxConversation, error)

	// Messages
	GetMessage(id int64) (*models.InboxMessage, error)
	ListMessages(conversationID int64, limit, offset int) ([]*models.InboxMessage, error)
	CreateMessage(msg *models.InboxMessage) (*models.InboxMessage, error)
	DeleteMessage(id, senderID int64) error
	MarkConversationRead(conversationID, userID int64) error
	UnreadTotal(userID int64) (int, error)
	UnreadCount(conversationID, userID int64) (int, error)
}
