package ws

import "encoding/json"

// handleGlobalChat appends the message to the ring buffer and broadcasts it to all clients.
func (h *Hub) handleGlobalChat(cm GlobalChatMessage) {
	// Update ring buffer under chatMu so concurrent sendChatHistory calls
	// always see a consistent snapshot.
	h.chatMu.Lock()
	h.nextChatID++
	cm.ID = h.nextChatID
	h.chatRing[h.chatHead] = cm
	h.chatHead = (h.chatHead + 1) % globalChatRingSize
	if h.chatCount < globalChatRingSize {
		h.chatCount++
	}
	h.chatMu.Unlock()

	// Broadcast to all clients — read lock only; clients with full buffers
	// are skipped and reaped by their write deadline.
	payload, _ := json.Marshal(cm)
	msg := &Message{Type: GlobalChat, Payload: payload}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		select {
		case client.Send <- msg:
		default:
			// Buffer full — skip. Client will be reaped by its write deadline.
		}
	}
}

// sendChatHistory delivers the recent global chat ring to a freshly connected client.
func (h *Hub) sendChatHistory(client *Client) {
	h.chatMu.Lock()
	if h.chatCount == 0 {
		h.chatMu.Unlock()
		return
	}
	start := (h.chatHead - h.chatCount + globalChatRingSize) % globalChatRingSize
	history := make([]GlobalChatMessage, h.chatCount)
	for i := 0; i < h.chatCount; i++ {
		history[i] = h.chatRing[(start+i)%globalChatRingSize]
	}
	h.chatMu.Unlock()

	payload, _ := json.Marshal(map[string]interface{}{"messages": history})
	msg := &Message{Type: GlobalChatHistory, Payload: payload}
	select {
	case client.Send <- msg:
	default:
	}
}
