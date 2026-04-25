package models

import "time"

// InboxConversation represents a private conversation between two users.
type InboxConversation struct {
	ID        int64     `json:"id"`
	User1ID   int64     `json:"user1_id"`
	User2ID   int64     `json:"user2_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Enriched fields resolved at the service layer
	OtherUser            *User         `json:"other_user,omitempty"`
	LastMessage          *InboxMessage `json:"last_message,omitempty"`
	UnreadCount          int           `json:"unread_count,omitempty"`
	BlockedByCurrentUser bool          `json:"blocked_by_current_user,omitempty"`
	BlockedByOtherUser   bool          `json:"blocked_by_other_user,omitempty"`
}

// InboxMessage is a single message in a private conversation.
type InboxMessage struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversation_id"`
	SenderID       int64     `json:"sender_id"`
	SenderName     string    `json:"sender_name,omitempty"`
	SenderAvatar   string    `json:"sender_avatar,omitempty"`
	Content        string    `json:"content"`
	MessageType    string    `json:"message_type"`
	AttachmentURL  string    `json:"attachment_url,omitempty"`
	AttachmentName string    `json:"attachment_name,omitempty"`
	AttachmentSize int64     `json:"attachment_size,omitempty"`
	AttachmentMime string    `json:"attachment_mime,omitempty"`
	IsRead         bool      `json:"is_read"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
