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
	Hub    *Hub
	Conn   *websocket.Conn
	Send   chan *Message
	UserID int64
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

		c.UserID = msg.UserID

		switch msg.Type {
		case Subscribe:
			c.handleSubscribe(msg)
		case Unsubscribe:
			c.handleUnsubscribe(msg)
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
