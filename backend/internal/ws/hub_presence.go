package ws

import (
	"encoding/json"
	"log"
)

// doPresenceBroadcast builds the current online user list and sends it to every
// connected client. Uses a read lock so broadcasts, subscriptions and other
// read-side operations are never blocked by presence fan-out.
// Clients with full send buffers are skipped rather than evicted — cleanup
// is handled by the client's WritePump / ReadPump deadline.
func (h *Hub) doPresenceBroadcast() {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Authenticated users: deduplicate by UserID, prefer entry with a name.
	// Guests: each connection is unique — use a negative ClientID as their presence ID.
	seen := make(map[int64]PresenceUser, len(h.clients))
	for client := range h.clients {
		var presenceID int64
		if client.UserID == 0 {
			presenceID = -client.ClientID // unique negative ID per guest connection
		} else {
			presenceID = client.UserID
		}
		pu := PresenceUser{
			UserID:   presenceID,
			UserName: client.UserName,
			Avatar:   client.Avatar,
			Route:    client.Route,
		}
		existing, ok := seen[presenceID]
		if !ok || (pu.UserName != "" && existing.UserName == "") {
			seen[presenceID] = pu
		}
	}
	users := make([]PresenceUser, 0, len(seen))
	for _, u := range seen {
		if len(users) >= 100 {
			break
		}
		users = append(users, u)
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"action": "presence_updated",
		"users":  users,
	})
	msg := &Message{Type: PresenceSync, Payload: payload}

	for client := range h.clients {
		select {
		case client.Send <- msg:
		default:
			// Buffer full — skip. Client will be reaped by its write deadline.
		}
	}
}

// handleTeleport routes a tp message to every connection matching TargetUserID.
// For authenticated users TargetUserID == UserID; for guests it equals -ClientID.
func (h *Hub) handleTeleport(req TeleportRequest) {
	payload, _ := json.Marshal(map[string]interface{}{"route": req.Route})
	msg := &Message{Type: Tp, Payload: payload}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		var presenceID int64
		if client.UserID == 0 {
			presenceID = -client.ClientID
		} else {
			presenceID = client.UserID
		}
		if presenceID == req.TargetUserID {
			select {
			case client.Send <- msg:
			default:
				log.Printf("ws: tp send buffer full for userID=%d", client.UserID)
			}
		}
	}
}

// handleCursorBroadcast relays a cursor position to every other client
// in the same cursor session AND on the same route.
// Sessions cap fan-out to cursorSessionSize regardless of total connection count.
func (h *Hub) handleCursorBroadcast(cu CursorBroadcast) {
	sender := cu.Client
	if sender.Route == "" {
		return
	}

	var presenceID int64
	if sender.UserID == 0 {
		presenceID = -sender.ClientID
	} else {
		presenceID = sender.UserID
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"user_id":   presenceID,
		"user_name": sender.UserName,
		"avatar":    sender.Avatar,
		"x":         cu.X,
		"y":         cu.Y,
	})
	msg := &Message{Type: Cursor, Payload: payload}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client == sender ||
			client.CursorSessionID != sender.CursorSessionID ||
			client.Route != sender.Route {
			continue
		}
		select {
		case client.Send <- msg:
		default:
		}
	}
}
