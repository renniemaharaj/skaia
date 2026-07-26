package ws

import (
	log "github.com/skaia/backend/internal/syslog"
	"time"
)

// handleRegister assigns a ClientID and session to the new client, then adds
// it to the hub's client map. Sessions are shared buckets used for chat,
// presence and cursor fan-out - existing sessions with capacity are reused
// before a new one is created. Rejects the connection if the server is at
// capacity.
func (h *Hub) handleRegister(client *Client) bool {
	h.mu.Lock()
	if _, exists := h.clients[client]; exists {
		h.mu.Unlock()
		return true
	}
	if h.connCount.Load() >= h.cfg.MaxConnections {
		h.mu.Unlock()
		log.Printf("ws: connection limit (%d) reached, rejecting %s", h.cfg.MaxConnections, clientLabel(client))
		client.close()
		return false
	}

	client.ClientID = h.nextClientID.Add(1)

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
	h.clients[client] = true
	h.connCount.Add(1)
	h.mu.Unlock()

	log.Printf("ws: joined  %s (session %d)", clientLabel(client), client.SessionID)
	h.sendJoinLeaveChat(client, "join")
	return true
}

// handleUnregister releases a client's session slot, removes it from all
// subscriptions, cancels its lifetime context, and decrements the connection counter.
func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	if _, ok := h.clients[client]; !ok {
		h.mu.Unlock()
		client.close()
		return
	}
	delete(h.clients, client)
	h.connCount.Add(-1)
	h.mu.Unlock()
	client.close()

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
	h.mu.Unlock()

	h.mu.RLock()
	guestSessionID := client.GuestSessionID
	recoveryAccepted := client.RecoveryAccepted
	h.mu.RUnlock()
	log.Printf("ws: left    %s", clientLabel(client))
	if client.UserID == 0 && guestSessionID != "" && !recoveryAccepted && h.OnGuestSessionClosed != nil {
		go h.OnGuestSessionClosed(guestSessionID)
	}
	h.sendJoinLeaveChat(client, "leave")
}

func (h *Hub) sendJoinLeaveChat(client *Client, kind string) {
	if client.SessionID == 0 {
		return
	}
	isGuest := client.UserID == 0
	userID := client.UserID
	h.mu.RLock()
	name := client.UserName
	avatar := client.Avatar
	guestSessionID := client.GuestSessionID
	h.mu.RUnlock()
	if isGuest {
		userID = -client.ClientID
		if name == "" {
			name = "Guest"
		}
	} else if name == "" {
		name = "User"
	}
	action := "joined"
	if kind == "leave" {
		action = "left"
	}
	h.SendGlobalChat(GlobalChatMessage{
		UserID:         userID,
		UserName:       name,
		Avatar:         avatar,
		Roles:          client.Roles,
		Content:        name + " has " + action,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		IsGuest:        isGuest,
		Kind:           kind,
		GuestSessionID: guestSessionID,
		SessionID:      client.SessionID,
	})
}

func (h *Hub) handleSubscribe(sub ResourceSubscription) bool {
	h.mu.Lock()
	if !h.clients[sub.Client] {
		h.mu.Unlock()
		return false
	}
	key := subscriptionKey(sub.ResourceType, sub.ResourceID)
	if h.clientSubs[sub.Client] == nil {
		h.clientSubs[sub.Client] = make(map[string]bool)
	}
	if h.clientSubs[sub.Client][key] {
		h.mu.Unlock()
		return true
	}
	if len(h.clientSubs[sub.Client]) >= h.cfg.MaxSubscriptions {
		h.mu.Unlock()
		return false
	}
	h.subscriptions[key] = append(h.subscriptions[key], sub.Client)
	h.clientSubs[sub.Client][key] = true
	h.mu.Unlock()
	log.Printf("ws: sub     %s => %s", clientLabel(sub.Client), key)
	return true
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
		client.queueMessage(msg)
	}
}
