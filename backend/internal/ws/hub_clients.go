package ws

import "log"

// handleRegister assigns a ClientID and session to the new client, then adds
// it to the hub's client map. Sessions are shared buckets used for chat,
// presence and cursor fan-out — existing sessions with capacity are reused
// before a new one is created. Rejects the connection if the server is at
// capacity.
func (h *Hub) handleRegister(client *Client) {
	if h.connCount.Load() >= h.cfg.MaxConnections {
		log.Printf("ws: connection limit (%d) reached, rejecting %s", h.cfg.MaxConnections, clientLabel(client))
		close(client.Send)
		return
	}
	h.connCount.Add(1)

	client.ClientID = h.nextClientID.Add(1)

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	// Assign the client to a session with available capacity, or open a new one.
	h.sessionMu.Lock()
	assigned := false
	for sid, count := range h.sessions {
		if count < h.cfg.SessionSize {
			h.sessions[sid]++
			client.SessionID = sid
			assigned = true
			break
		}
	}
	if !assigned {
		h.nextSession++
		sid := h.nextSession
		h.sessions[sid] = 1
		client.SessionID = sid
	}

	// Ensure the session has a chat ring buffer.
	h.chatMu.Lock()
	if _, ok := h.chatRings[client.SessionID]; !ok {
		h.chatRings[client.SessionID] = newSessionChatRing(h.cfg.ChatRingSize)
	}
	h.chatMu.Unlock()

	h.sessionMu.Unlock()

	log.Printf("ws: joined  %s (session %d)", clientLabel(client), client.SessionID)
}

// handleUnregister releases a client's session slot, removes it from all
// subscriptions, closes its send channel, and decrements the connection counter.
func (h *Hub) handleUnregister(client *Client) {
	// Decrement the connection counter so new connections can take this slot.
	h.connCount.Add(-1)

	// Release session slot before acquiring the main lock.
	h.sessionMu.Lock()
	if count, ok := h.sessions[client.SessionID]; ok {
		if count <= 1 {
			delete(h.sessions, client.SessionID)
			// Clean up the chat ring for a now-empty session.
			h.chatMu.Lock()
			delete(h.chatRings, client.SessionID)
			h.chatMu.Unlock()
		} else {
			h.sessions[client.SessionID]--
		}
	}
	h.sessionMu.Unlock()

	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return
	}

	delete(h.clients, client)
	close(client.Send)

	// Use the reverse index for O(subscribed-keys) cleanup instead of
	// scanning every subscription key in the map.
	if keys, ok := h.clientSubs[client]; ok {
		for key := range keys {
			subs := h.subscriptions[key]
			filtered := make([]*Client, 0, len(subs))
			for _, c := range subs {
				if c != client {
					filtered = append(filtered, c)
				}
			}
			if len(filtered) == 0 {
				delete(h.subscriptions, key)
			} else {
				h.subscriptions[key] = filtered
			}
		}
		delete(h.clientSubs, client)
	}
	log.Printf("ws: left    %s", clientLabel(client))
}

func (h *Hub) handleSubscribe(sub ResourceSubscription) {
	h.mu.Lock()
	key := subscriptionKey(sub.ResourceType, sub.ResourceID)
	h.subscriptions[key] = append(h.subscriptions[key], sub.Client)
	if h.clientSubs[sub.Client] == nil {
		h.clientSubs[sub.Client] = make(map[string]bool)
	}
	h.clientSubs[sub.Client][key] = true
	h.mu.Unlock()
	log.Printf("ws: sub     %s → %s", clientLabel(sub.Client), key)
}

func (h *Hub) handleUnsubscribe(unsub ResourceSubscription) {
	h.mu.Lock()
	defer h.mu.Unlock()

	key := subscriptionKey(unsub.ResourceType, unsub.ResourceID)
	clients, exists := h.subscriptions[key]
	if !exists {
		return
	}

	filtered := make([]*Client, 0, len(clients))
	for _, c := range clients {
		if c != unsub.Client {
			filtered = append(filtered, c)
		}
	}
	if len(filtered) == 0 {
		delete(h.subscriptions, key)
	} else {
		h.subscriptions[key] = filtered
	}
	if keys, ok := h.clientSubs[unsub.Client]; ok {
		delete(keys, key)
		if len(keys) == 0 {
			delete(h.clientSubs, unsub.Client)
		}
	}
	log.Printf("ws: client %p unsubscribed from %s", unsub.Client, key)
}

// handleBroadcast fans a message out to every connected client.
// Uses a read lock so other operations are not blocked during fan-out.
// Clients with full send buffers are skipped; cleanup is handled by
// the client's WritePump / ReadPump deadlines.
func (h *Hub) handleBroadcast(msg *Message) {
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
