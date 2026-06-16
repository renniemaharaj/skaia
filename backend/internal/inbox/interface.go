// Package inbox provides private direct messaging between authenticated users.
package inbox

import "github.com/skaia/backend/models"

// ParticipantRow represents a raw row from the junction table
type ParticipantRow struct {
	UserID  int64
	Role    string
	IsMuted bool
}

// Repository is the storage contract for the inbox domain.
type Repository interface {
	// Conversations
	GetConversation(id int64) (*models.InboxConversation, error)
	GetConversationBetween(user1ID, user2ID int64) (*models.InboxConversation, error)
	GetOrCreateConversation(user1ID, user2ID int64) (*models.InboxConversation, error)
	CreateGroupConversation(title string, creatorID int64, participantIDs []int64) (*models.InboxConversation, error)
	ListConversations(userID int64) ([]*models.InboxConversation, error)
	GetParticipants(conversationID int64) ([]ParticipantRow, error)
	SetConversationLocked(id int64, locked bool) error
	UpdateParticipantRole(conversationID, userID int64, role string) error
	SetParticipantMuted(conversationID, userID int64, muted bool) error
	RemoveParticipant(conversationID, userID int64) error
	AddParticipant(conversationID, userID int64, role string) error
	DeleteConversation(id int64) error
	GetNoreplyUserID() (int64, error)

	// Messages
	GetMessage(id int64) (*models.InboxMessage, error)
	ListMessages(conversationID int64, limit, offset int) ([]*models.InboxMessage, error)
	CreateMessage(msg *models.InboxMessage) (*models.InboxMessage, error)
	DeleteMessage(id, senderID int64) error
	MarkConversationRead(conversationID, userID int64) error
	UnreadTotal(userID int64) (int, error)
	UnreadCount(conversationID, userID int64) (int, error)

	// Blocks
	BlockUser(blockerID, blockedID int64) error
	UnblockUser(blockerID, blockedID int64) error
	IsBlocked(blockerID, blockedID int64) (bool, error)
	IsBlockedEither(userA, userB int64) (bool, error)
	ListBlockedUsers(blockerID int64) ([]int64, error)
}
