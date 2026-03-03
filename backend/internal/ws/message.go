package ws

import (
	"encoding/json"

	"github.com/skaia/backend/models"
)

// MessageType defines the type of WebSocket message.
type MessageType string

const (
	StoreSync    MessageType = "store:sync"
	StoreUpdate  MessageType = "store:update"
	ForumSync    MessageType = "forum:sync"
	ForumUpdate  MessageType = "forum:update"
	UserUpdate   MessageType = "user:update"
	UserJoin     MessageType = "user:join"
	UserLeave    MessageType = "user:leave"
	Subscribe    MessageType = "subscribe"
	Unsubscribe  MessageType = "unsubscribe"
	Ping         MessageType = "ping"
	Presence     MessageType = "presence"        // client → server: announce route
	PresenceSync MessageType = "presence:update" // server → client: online list
)

// PresenceUser is the public representation of a single online user sent to clients.
type PresenceUser struct {
	UserID   int64  `json:"user_id"`
	UserName string `json:"user_name"`
	Avatar   string `json:"avatar"`
	Route    string `json:"route"`
}

// Message represents a WebSocket message.
type Message struct {
	Type    MessageType     `json:"type"`
	UserID  int64           `json:"user_id,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

// StorePayload carries store-related update data.
type StorePayload struct {
	Cart       []*models.CartItem      `json:"cart,omitempty"`
	Products   []*models.Product       `json:"products,omitempty"`
	Categories []*models.StoreCategory `json:"categories,omitempty"`
}

// ForumPayload carries forum-related update data.
type ForumPayload struct {
	Threads  []*models.ForumThread   `json:"threads,omitempty"`
	Comments []*models.ThreadComment `json:"comments,omitempty"`
}

// ResourceSubscription tracks a client's interest in a specific resource.
type ResourceSubscription struct {
	Client       *Client
	ResourceType string
	ResourceID   int64
}
