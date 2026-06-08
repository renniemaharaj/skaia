package models

import "time"

// InboxConversation represents a conversation between multiple users.
type InboxConversation struct {
	ID        int64     `json:"id"`
	IsGroup   bool      `json:"is_group"`
	Title     string    `json:"title,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Enriched fields resolved at the service layer
	Participants         []*User       `json:"participants,omitempty"`
	OtherUser            *User         `json:"other_user,omitempty"` // Kept for backwards compatibility on 1-on-1s
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
