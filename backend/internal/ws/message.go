package ws

import (
	"encoding/json"

	"github.com/skaia/backend/models"
)

// MessageType defines the type of WebSocket message.
type MessageType string

const (
	StoreSync          MessageType = "store:sync"
	StoreUpdate        MessageType = "store:update"
	ForumSync          MessageType = "forum:sync"
	ForumUpdate        MessageType = "forum:update"
	UserUpdate         MessageType = "user:update"
	UserJoin           MessageType = "user:join"
	UserLeave          MessageType = "user:leave"
	Subscribe          MessageType = "subscribe"
	Unsubscribe        MessageType = "unsubscribe"
	Ping               MessageType = "ping"
	Presence           MessageType = "presence"            // client → server: announce route
	PresenceSync       MessageType = "presence:update"     // server → client: online list
	Tp                 MessageType = "tp"                  // client → server → target: teleport request
	GlobalChat         MessageType = "global:chat"         // bidirectional: send / receive global chat
	GlobalChatHistory  MessageType = "global:chat:history" // server → client on connect: recent history
	InboxUpdate        MessageType = "inbox:update"        // server → subscribed clients: conversation changed
	InboxMsg           MessageType = "inbox:message"       // server → recipient: unread badge ping
	NotificationMsg    MessageType = "notification"        // server → client: incoming user notification
	NotificationUpdate MessageType = "notification:update" // server → client: notification read/deleted
	NotificationSync   MessageType = "notification:sync"   // server → client on connect: notification bootstrap
	CartUpdate         MessageType = "cart:update"         // server → client: user's cart changed
	ConfigUpdate       MessageType = "config:update"       // server → all: branding/seo/footer/landing changed
	PageUpdate         MessageType = "page:update"         // server → all: CMS page created/updated/deleted
	Cursor             MessageType = "cursor:update"       // client → server → same-route clients: cursor position
	EventsUpdate       MessageType = "events:update"       // server → admin clients: new audit event
)

// PresenceUser is the public representation of a single online user sent to clients.
type PresenceUser struct {
	UserID   int64  `json:"user_id"`
	UserName string `json:"user_name"`
	Avatar   string `json:"avatar"`
	Route    string `json:"route"`
}

// GlobalChatMessage is a single message in the session chat channel.
type GlobalChatMessage struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	UserName  string `json:"user_name"`
	Avatar    string `json:"avatar"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
	IsGuest   bool   `json:"is_guest"`
	SessionID int64  `json:"-"` // internal routing — not serialised to clients
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
