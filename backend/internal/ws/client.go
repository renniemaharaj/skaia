package ws

import (
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

// Client represents a single WebSocket connection managed by the Hub.
type Client struct {
	Hub             *Hub
	Conn            *websocket.Conn
	Send            chan *Message
	ClientID        int64 // unique per connection, assigned by Hub at registration
	UserID          int64
	CursorSessionID int64 // cursor-presence session bucket, assigned at registration
	// Presence fields — written under Hub.mu.Lock via presenceUpdates.
	Route    string
	UserName string
	Avatar   string
}

// ReadPump pumps inbound messages from the connection to the hub.
// It runs in its own goroutine for each client.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Time{}) // no deadline
	for {
		var msg Message
		if err := c.Conn.ReadJSON(&msg); err != nil {
			return
		}

		// Only accept a positive user_id from the client; messages like subscribe/ping
		// omit the field (deserialises as 0) and must never overwrite an established identity.
		if msg.UserID > 0 {
			c.UserID = msg.UserID
		}

		switch msg.Type {
		case Subscribe:
			c.handleSubscribe(msg)
		case Unsubscribe:
			c.handleUnsubscribe(msg)
		case Presence:
			c.handlePresence(msg)
		case Tp:
			c.handleTp(msg)
		case GlobalChat:
			c.handleGlobalChat(msg)
		case Cursor:
			c.handleCursor(msg)
		case Ping:
			// nothing — client keepalive only
		default:
			c.Hub.Broadcast(&msg)
		}
	}
}

// WritePump pumps outbound messages from the hub to the connection.
// It runs in its own goroutine for each client.
func (c *Client) WritePump() {
	for msg := range c.Send {
		w, err := c.Conn.NextWriter(websocket.TextMessage)
		if err != nil {
			return
		}
		if err := json.NewEncoder(w).Encode(msg); err != nil {
			w.Close()
			return
		}
		w.Close()
	}
	c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
}

// ── internal helpers ─────────────────────────────────────────────────────────

func (c *Client) handleSubscribe(msg Message) {
	var payload map[string]interface{}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	resourceType, ok := payload["resource_type"].(string)
	if !ok {
		return
	}
	rid, ok := parseResourceID(payload["resource_id"])
	if !ok {
		return
	}
	c.Hub.Subscribe(c, resourceType, rid)
	log.Printf("ws: client %p subscribed to %s:%d", c, resourceType, rid)
}

func (c *Client) handleUnsubscribe(msg Message) {
	var payload map[string]interface{}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	resourceType, ok := payload["resource_type"].(string)
	if !ok {
		return
	}
	rid, ok := parseResourceID(payload["resource_id"])
	if !ok {
		return
	}
	c.Hub.Unsubscribe(c, resourceType, rid)
	log.Printf("ws: client %p unsubscribed from %s:%d", c, resourceType, rid)
}

// handlePresence forwards a presence announcement to the hub for processing.
func (c *Client) handlePresence(msg Message) {
	type presencePayload struct {
		Route    string `json:"route"`
		UserName string `json:"user_name"`
		Avatar   string `json:"avatar"`
	}
	var p presencePayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return
	}
	select {
	case c.Hub.presenceUpdates <- ClientPresence{Client: c, Route: p.Route, UserName: p.UserName, Avatar: p.Avatar}:
	default:
	}
}

// handleCursor forwards a cursor position update to the hub for same-route broadcast.
func (c *Client) handleCursor(msg Message) {
	type cursorPayload struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	var p cursorPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return
	}
	// Clamp to [0, 1].
	if p.X < 0 {
		p.X = 0
	} else if p.X > 1 {
		p.X = 1
	}
	if p.Y < 0 {
		p.Y = 0
	} else if p.Y > 1 {
		p.Y = 1
	}
	select {
	case c.Hub.cursorUpdates <- CursorBroadcast{Client: c, X: p.X, Y: p.Y}:
	default:
	}
}

// handleTp forwards a teleport request to the hub for targeted routing.
func (c *Client) handleTp(msg Message) {
	// Only authenticated users may send tp messages.
	if c.UserID == 0 {
		return
	}
	type tpPayload struct {
		TargetUserID int64  `json:"target_user_id"`
		Route        string `json:"route"`
	}
	var p tpPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return
	}
	if p.Route == "" || p.TargetUserID == 0 {
		return
	}
	c.Hub.SendTeleport(p.TargetUserID, p.Route)
}

// handleGlobalChat validates and enqueues a global chat message from this client.
func (c *Client) handleGlobalChat(msg Message) {
	type chatPayload struct {
		Content string `json:"content"`
	}
	var p chatPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil || len(p.Content) == 0 {
		return
	}
	// Truncate very long messages.
	if len(p.Content) > 500 {
		p.Content = p.Content[:500]
	}

	isGuest := c.UserID == 0
	userID := c.UserID
	if isGuest {
		userID = -c.ClientID
	}

	name := c.UserName
	if name == "" {
		if isGuest {
			name = "Guest"
		} else {
			name = "User"
		}
	}

	now := time.Now()
	c.Hub.SendGlobalChat(GlobalChatMessage{
		UserID:    userID,
		UserName:  name,
		Avatar:    c.Avatar,
		Content:   p.Content,
		CreatedAt: now.UTC().Format(time.RFC3339),
		IsGuest:   isGuest,
	})
}

// subscriptionKey returns the canonical map key for a resource subscription.
func subscriptionKey(resourceType string, resourceID int64) string {
	return resourceType + ":" + strconv.FormatInt(resourceID, 10)
}

// parseResourceID accepts a JSON number (float64) or string.
func parseResourceID(v interface{}) (int64, bool) {
	switch val := v.(type) {
	case float64:
		return int64(val), true
	case string:
		if id, err := strconv.ParseInt(val, 10, 64); err == nil {
			return id, true
		}
	}
	return 0, false
}
