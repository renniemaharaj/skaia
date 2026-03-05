package ws

import (
	"encoding/json"
	"log"
)

// doPresenceBroadcast builds a per-session online user list and sends it only
// to clients within the same session. This bounds fan-out to O(SessionSize)
// per session regardless of total connection count.
func (h *Hub) doPresenceBroadcast() {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Group clients by session, deduplicating users within each session.
	type sessionData struct {
		seen    map[int64]PresenceUser
		clients []*Client
	}
	bySession := make(map[int64]*sessionData)

	for client := range h.clients {
		sd, ok := bySession[client.SessionID]
		if !ok {
			sd = &sessionData{seen: make(map[int64]PresenceUser)}
			bySession[client.SessionID] = sd
		}
		sd.clients = append(sd.clients, client)

		var presenceID int64
		if client.UserID == 0 {
			presenceID = -client.ClientID
		} else {
			presenceID = client.UserID
		}
		pu := PresenceUser{
			UserID:   presenceID,
			UserName: client.UserName,
			Avatar:   client.Avatar,
			Route:    client.Route,
		}
		existing, exists := sd.seen[presenceID]
		if !exists || (pu.UserName != "" && existing.UserName == "") {
			sd.seen[presenceID] = pu
		}
	}

	for _, sd := range bySession {
		users := make([]PresenceUser, 0, len(sd.seen))
		for _, u := range sd.seen {
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

		for _, client := range sd.clients {
			select {
			case client.Send <- msg:
			default:
			}
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
// in the same session AND on the same route.
// Sessions cap fan-out to cfg.SessionSize regardless of total connection count.
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
			client.SessionID != sender.SessionID ||
			client.Route != sender.Route {
			continue
		}
		select {
		case client.Send <- msg:
		default:
		}
	}
}
