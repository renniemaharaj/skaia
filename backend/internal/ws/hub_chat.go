package ws

import "encoding/json"

// handleGlobalChat appends the message to the sender's session ring buffer and
// broadcasts it only to clients in the same session, bounding fan-out to
// O(SessionSize) regardless of total connection count.
func (h *Hub) handleGlobalChat(cm GlobalChatMessage) {
	// Assign a hub-wide monotonic ID so chat IDs are globally unique even
	// though messages are scoped to sessions.
	h.chatMu.Lock()
	h.nextChatID++
	cm.ID = h.nextChatID

	ring, ok := h.chatRings[cm.SessionID]
	if ok {
		ring.push(cm)
	}
	h.chatMu.Unlock()

	payload, _ := json.Marshal(cm)
	msg := &Message{Type: GlobalChat, Payload: payload}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.SessionID != cm.SessionID {
			continue
		}
		select {
		case client.Send <- msg:
		default:
			// Buffer full — skip. Client will be reaped by its write deadline.
		}
	}
}

// sendChatHistory delivers the recent session chat ring to a freshly connected client.
func (h *Hub) sendChatHistory(client *Client) {
	h.chatMu.Lock()
	ring, ok := h.chatRings[client.SessionID]
	if !ok || ring.count == 0 {
		h.chatMu.Unlock()
		return
	}
	history := ring.history()
	h.chatMu.Unlock()

	payload, _ := json.Marshal(map[string]interface{}{"messages": history})
	msg := &Message{Type: GlobalChatHistory, Payload: payload}
	select {
	case client.Send <- msg:
	default:
	}
}

// sendNotificationBootstrap delivers the user's recent notifications to a
// freshly-connected authenticated client. A no-op for guests or when no fetcher is set.
func (h *Hub) sendNotificationBootstrap(client *Client) {
	if client.UserID == 0 || h.NotificationFetcher == nil {
		return
	}
	data := h.NotificationFetcher(client.UserID)
	if data == nil {
		return
	}
	payload, _ := json.Marshal(data)
	msg := &Message{Type: NotificationSync, Payload: payload}
	select {
	case client.Send <- msg:
	default:
	}
}
