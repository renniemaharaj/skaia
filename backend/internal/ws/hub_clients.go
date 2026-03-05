package ws

import "log"

// handleRegister assigns a ClientID and cursor session to the new client,
// then adds it to the hub's client map. Rejects the connection if the server
// is at capacity.
func (h *Hub) handleRegister(client *Client) {
	if h.connCount.Load() >= maxConnections {
		log.Printf("ws: connection limit (%d) reached, rejecting %s", maxConnections, clientLabel(client))
		close(client.Send)
		return
	}
	h.connCount.Add(1)

	client.ClientID = h.nextClientID.Add(1)

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	// Assign the client to a cursor session with available capacity, or open a new one.
	h.cursorSessionMu.Lock()
	assigned := false
	for sid, count := range h.cursorSessions {
		if count < cursorSessionSize {
			h.cursorSessions[sid]++
			client.CursorSessionID = sid
			assigned = true
			break
		}
	}
	if !assigned {
		h.nextCursorSession++
		sid := h.nextCursorSession
		h.cursorSessions[sid] = 1
		client.CursorSessionID = sid
	}
	h.cursorSessionMu.Unlock()

	log.Printf("ws: joined  %s (cursor session %d)", clientLabel(client), client.CursorSessionID)
}

// handleUnregister releases a client's cursor session slot, removes it from all
// subscriptions, closes its send channel, and decrements the connection counter.
func (h *Hub) handleUnregister(client *Client) {
	// Decrement the connection counter so new connections can take this slot.
	h.connCount.Add(-1)

	// Release cursor session slot before acquiring the main lock.
	h.cursorSessionMu.Lock()
	if count, ok := h.cursorSessions[client.CursorSessionID]; ok {
		if count <= 1 {
			delete(h.cursorSessions, client.CursorSessionID)
		} else {
			h.cursorSessions[client.CursorSessionID]--
		}
	}
	h.cursorSessionMu.Unlock()

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
