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

	// Remove all subscriptions for this client.
	for key, clients := range h.subscriptions {
		filtered := make([]*Client, 0, len(clients))
		for _, c := range clients {
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
	log.Printf("ws: left    %s", clientLabel(client))
}

func (h *Hub) handleSubscribe(sub ResourceSubscription) {
	h.mu.Lock()
	key := subscriptionKey(sub.ResourceType, sub.ResourceID)
	h.subscriptions[key] = append(h.subscriptions[key], sub.Client)
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
	log.Printf("ws: client %p unsubscribed from %s", unsub.Client, key)
}

// handleBroadcast fans a message out to every connected client.
// Clients whose send channel is full are evicted.
func (h *Hub) handleBroadcast(msg *Message) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		select {
		case client.Send <- msg:
		default:
			// Send buffer full — drop the client.
			close(client.Send)
			delete(h.clients, client)
		}
	}
}
