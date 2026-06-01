package ws

import (
	"encoding/json"

	"github.com/skaia/backend/models"
)

// MessageType defines the type of WebSocket message.
type MessageType string

const (
	StoreSync            MessageType = "store:sync"
	StoreUpdate          MessageType = "store:update"
	ForumSync            MessageType = "forum:sync"
	ForumUpdate          MessageType = "forum:update"
	UserUpdate           MessageType = "user:update"
	UserJoin             MessageType = "user:join"
	UserLeave            MessageType = "user:leave"
	Subscribe            MessageType = "subscribe"
	Unsubscribe          MessageType = "unsubscribe"
	Ping                 MessageType = "ping"
	Presence             MessageType = "presence"               // client => server: announce route
	PresenceSync         MessageType = "presence:update"        // server => client: online list
	Tp                   MessageType = "tp"                     // client => server => target: teleport request
	GlobalChat           MessageType = "global:chat"            // bidirectional: send / receive global chat
	GlobalChatHistory    MessageType = "global:chat:history"    // server => client on connect: recent history
	InboxUpdate          MessageType = "inbox:update"           // server => subscribed clients: conversation changed
	InboxMsg             MessageType = "inbox:message"          // server => recipient: unread badge ping
	NotificationMsg      MessageType = "notification"           // server => client: incoming user notification
	NotificationUpdate   MessageType = "notification:update"    // server => client: notification read/deleted
	NotificationSync     MessageType = "notification:sync"      // server => client on connect: notification bootstrap
	CartUpdate           MessageType = "cart:update"            // server => client: user's cart changed
	ConfigUpdate         MessageType = "config:update"          // server => all: branding/seo/footer/landing changed
	PageUpdate           MessageType = "page:update"            // server => all: CMS page created/updated/deleted
	Cursor               MessageType = "cursor:update"          // client => server => same-route clients: cursor position
	EventsUpdate         MessageType = "events:update"          // server => admin clients: new audit event
	VoiceControl         MessageType = "voice:control"          // client => server => client: admin voice chat controls
	MediaAdd             MessageType = "media:add"              // client => server: add youtube video
	MediaRemove          MessageType = "media:remove"           // client => server: remove queue item
	MediaAction          MessageType = "media:action"           // client => server: pause/resume queue
	MediaEnded           MessageType = "media:ended"            // client => server: current video ended
	MediaTransitionStart MessageType = "media:transition:start" // client => server: start transition mixing
	MediaTransition      MessageType = "media:transition"       // client => server: manual transition
	MediaHistoryClear    MessageType = "media:history:clear"    // client => server: clear route history
	MediaSync            MessageType = "media:sync"             // server => client: full queue sync
	MediaSfx             MessageType = "media:sfx"              // client => server => room: play sound effect
	ErrorMessage         MessageType = "error"
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

// VoiceControlPayload carries admin actions for voice chat on a specific route.
type VoiceControlPayload struct {
	Route        string `json:"route"`
	Action       string `json:"action"` // "mute", "unmute", "kick", "enable", "disable"
	TargetUserID int64  `json:"target_user_id,omitempty"`
}

// MediaItem represents a single video in the queue or history.
type MediaItem struct {
	ID        string `json:"id"`
	HistoryID int64  `json:"history_id,omitempty"`
	VideoID   string `json:"video_id"`
	AddedBy   int64  `json:"added_by"`
	UserName  string `json:"user_name"`
	Loop      bool   `json:"loop"`
	CreatedAt string `json:"created_at"`
}

type MediaPlaylist struct {
	ID        string      `json:"id"`
	StartTime string      `json:"start_time"`
	Items     []MediaItem `json:"items"`
}

// MediaState payload represents the current playback queue and history for a route.
type MediaState struct {
	Route           string          `json:"route"`
	Queue           []MediaItem     `json:"queue"`
	History         []MediaItem     `json:"history"`
	Playlists       []MediaPlaylist `json:"playlists"`
	IsPaused        bool            `json:"is_paused"`
	CurrentPosition float64         `json:"current_position"`
	UpdatedAt       string      `json:"updated_at"`
	TransitioningID string      `json:"transitioning_item_id"`
}

// MediaClientAction represents an action requested by a client (add, remove, etc).
type MediaClientAction struct {
	Route    string  `json:"route"`
	VideoID  string  `json:"video_id,omitempty"`
	ItemID   string  `json:"item_id,omitempty"`
	Loop     bool    `json:"loop,omitempty"`
	Position float64 `json:"position,omitempty"`
}
