package ws

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"time"
)

// generateID creates a quick random hex string for queue items.
func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// handleMediaUpdate processes any media actions sent from a client.
func (h *Hub) handleMediaUpdate(mu MediaUpdateAction) {
	var action MediaClientAction
	if err := json.Unmarshal(mu.Message.Payload, &action); err != nil {
		log.Printf("ws: failed to unmarshal media action: %v", err)
		return
	}

	route := action.Route
	if route == "" {
		return // Ignore updates without a route
	}

	h.mediaMu.Lock()
	state, exists := h.mediaRoutes[route]
	if !exists {
		state = &MediaState{
			Route:           route,
			Queue:           []MediaItem{},
			History:         []MediaItem{},
			IsPaused:        false,
			CurrentPosition: 0,
			UpdatedAt:       time.Now().UTC().Format(time.RFC3339),
		}
		h.mediaRoutes[route] = state
	}
	stateChanged := false

	switch mu.Message.Type {
	case MediaAdd:
		// Basic validation could happen here (e.g. valid YouTube ID length)
		if action.VideoID != "" {
			item := MediaItem{
				ID:        generateID(),
				VideoID:   action.VideoID,
				AddedBy:   mu.Client.UserID,
				UserName:  mu.Client.UserName,
				Loop:      action.Loop,
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			}
			wasEmpty := len(state.Queue) == 0
			state.Queue = append(state.Queue, item)
			if wasEmpty {
				state.CurrentPosition = 0
				state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
				// If adding to empty queue, auto-play it
				state.IsPaused = false
			}
			stateChanged = true
		}

	case MediaRemove:
		// Remove by ItemID from Queue
		for i, item := range state.Queue {
			if item.ID == action.ItemID {
				state.Queue = append(state.Queue[:i], state.Queue[i+1:]...)
				stateChanged = true
				break
			}
		}
		// Also allow removing from History
		for i, item := range state.History {
			if item.ID == action.ItemID {
				state.History = append(state.History[:i], state.History[i+1:]...)
				stateChanged = true
				break
			}
		}

	case MediaAction:
		// Toggle pause for the route. Requires admin perm.
		hasAdmin := false
		for _, p := range mu.Client.Permissions {
			if p == "home.manage" { // Or a specific media permission
				hasAdmin = true
				break
			}
		}
		if hasAdmin {
			// Toggle pause state
			state.IsPaused = !state.IsPaused
			state.CurrentPosition = action.Position // accept current position from admin
			state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			stateChanged = true
		}

	case MediaEnded:
		// Popping the top of the queue and handling loop/history logic
		// We only act if the ItemID provided matches the top of the queue,
		// ensuring multiple clients sending "ended" at the same time don't double-pop.
		if len(state.Queue) > 0 && state.Queue[0].ID == action.ItemID {
			top := state.Queue[0]
			state.Queue = state.Queue[1:]

			if top.Loop {
				// Put back in queue at the bottom
				state.Queue = append(state.Queue, top)
			} else {
				// Prepend to history
				state.History = append([]MediaItem{top}, state.History...)
				// Cap history size to e.g. 50 items
				if len(state.History) > 50 {
					state.History = state.History[:50]
				}
			}
			state.CurrentPosition = 0
			state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			stateChanged = true
		}

	case MediaHistoryClear:
		hasAdmin := false
		for _, p := range mu.Client.Permissions {
			if p == "home.manage" {
				hasAdmin = true
				break
			}
		}
		if hasAdmin {
			state.History = []MediaItem{}
			stateChanged = true
		}
	}

	h.mediaMu.Unlock()

	// Broadcast sync if state was modified
	if stateChanged {
		h.broadcastMediaSync(route)
	}
}

// broadcastMediaSync broadcasts the current media state for a route to all clients on it.
// Uses a separate read lock to avoid holding the main lock during network dispatch.
func (h *Hub) broadcastMediaSync(route string) {
	h.mediaMu.RLock()
	state, exists := h.mediaRoutes[route]
	h.mediaMu.RUnlock()

	if !exists {
		return
	}

	payload, err := json.Marshal(state)
	if err != nil {
		return
	}

	msg := &Message{
		Type:    MediaSync,
		Payload: payload,
	}

	h.mu.RLock()
	for client := range h.clients {
		if client.Route == route {
			select {
			case client.Send <- msg:
			default:
				// ignore if buffer full
			}
		}
	}
	h.mu.RUnlock()
}

// sendMediaSyncToClient sends the current media state for the client's route directly to them.
func (h *Hub) sendMediaSyncToClient(client *Client) {
	h.mu.RLock()
	route := client.Route
	h.mu.RUnlock()

	if route == "" {
		return
	}

	h.mediaMu.RLock()
	state, exists := h.mediaRoutes[route]
	h.mediaMu.RUnlock()

	if !exists {
		state = &MediaState{
			Route:           route,
			Queue:           []MediaItem{},
			History:         []MediaItem{},
			IsPaused:        false,
			CurrentPosition: 0,
			UpdatedAt:       time.Now().UTC().Format(time.RFC3339),
		}
	}

	payload, err := json.Marshal(state)
	if err != nil {
		return
	}
	msg := &Message{Type: MediaSync, Payload: payload}

	select {
	case client.Send <- msg:
	default:
	}
}
