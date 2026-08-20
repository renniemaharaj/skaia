package ws

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	log "github.com/skaia/backend/internal/syslog"
	"time"

	"github.com/skaia/backend/internal/streammeta"
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
	h.mu.RLock()
	clientRoute := mu.Client.Route
	clientUserName := mu.Client.UserName
	h.mu.RUnlock()
	if route == "" || route != clientRoute {
		return // Ignore updates without a route
	}
	if !h.canMutateAccount(mu.Client) || !h.canManageMediaRoute(mu.Client, route) || !validPresenceRoute(route) {
		mu.Client.sendClientErrorAction("forbidden", "You do not have permission to control media on this route.", 0)
		return
	}
	h.mediaMu.RLock()
	_, exists := h.mediaRoutes[route]
	full := len(h.mediaRoutes) >= h.cfg.MaxMediaRoutes
	h.mediaMu.RUnlock()
	if !exists && full {
		mu.Client.sendClientErrorAction("capacity", "Media controls are temporarily at capacity.", 0)
		return
	}

	state := h.getOrCreateMediaState(route)

	h.mediaMu.Lock()
	stateChanged := false

	switch mu.Message.Type {
	case MediaAdd:
		// Basic validation could happen here (e.g. valid YouTube ID length)
		if action.VideoID != "" {
			item := MediaItem{
				ID:        generateID(),
				VideoID:   action.VideoID,
				AddedBy:   mu.Client.UserID,
				UserName:  clientUserName,
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
				var err error
				if item.HistoryID > 0 {
					err = h.mediaRepo.DeleteHistoryItem(item.HistoryID, mu.Client.UserID)
				} else {
					err = h.mediaRepo.DeleteHistoryItemByData(route, item.VideoID, item.CreatedAt, mu.Client.UserID)
				}
				if err != nil {
					log.Printf("ws: media history delete failed: %v", err)
					break
				}
				state.History = append(state.History[:i], state.History[i+1:]...)
				stateChanged = true
				break
			}
		}

	case MediaAction:
		state.IsPaused = !state.IsPaused
		state.CurrentPosition = action.Position
		state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		stateChanged = true

	case MediaEnded:
		// Popping the top of the queue and handling loop/history logic
		// We only act if the ItemID provided matches the top of the queue,
		// ensuring multiple clients sending "ended" at the same time don't double-pop.
		if len(state.Queue) > 0 && state.Queue[0].ID == action.ItemID {
			top := state.Queue[0]
			if !top.Loop {
				historyID, err := h.mediaRepo.SaveHistory(route, top)
				if err != nil {
					log.Printf("ws: media history save failed: %v", err)
					break
				}
				top.HistoryID = historyID
			}

			state.Queue = state.Queue[1:]
			if top.Loop {
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

	case MediaTransitionStart:
		if len(state.Queue) > 1 && state.Queue[1].ID == action.ItemID {
			state.TransitioningID = action.ItemID
			stateChanged = true
		}

	case MediaTransition:
		if len(state.Queue) > 0 && state.Queue[0].ID == action.ItemID {
			top := state.Queue[0]
			if !top.Loop {
				historyID, err := h.mediaRepo.SaveHistory(route, top)
				if err != nil {
					log.Printf("ws: media history save failed: %v", err)
					break
				}
				top.HistoryID = historyID
			}

			state.Queue = state.Queue[1:]
			if top.Loop {
				state.Queue = append(state.Queue, top)
			} else {
				// Prepend to history
				state.History = append([]MediaItem{top}, state.History...)
				// Cap history size to e.g. 50 items
				if len(state.History) > 50 {
					state.History = state.History[:50]
				}
			}
			state.CurrentPosition = action.Position
			state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			state.TransitioningID = ""
			stateChanged = true
		}

	case MediaHistoryClear:
		if err := h.mediaRepo.ClearHistory(route, mu.Client.UserID); err != nil {
			log.Printf("ws: media history clear failed: %v", err)
			break
		}
		state.History = []MediaItem{}
		stateChanged = true

	case MediaSfx:
		// Broadcast the SFX message directly to all clients on this route (except sender)
		h.mu.RLock()
		for client := range h.clients {
			if client.Route == route && client.ClientID != mu.Client.ClientID {
				client.queueMessage(&mu.Message)
			}
		}
		h.mu.RUnlock()
	}

	h.mediaMu.Unlock()

	// Broadcast sync if state was modified
	if stateChanged {
		recalculatePlaylists(state)
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
			client.queueMessage(msg)
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
		if !h.canMutateAccount(client) || !h.canManageMediaRoute(client, route) || !validPresenceRoute(route) {
			return
		}
		h.mediaMu.RLock()
		full := len(h.mediaRoutes) >= h.cfg.MaxMediaRoutes
		h.mediaMu.RUnlock()
		if full {
			return
		}
		state = h.getOrCreateMediaState(route)
	}
	h.mediaMu.RLock()
	defer h.mediaMu.RUnlock()

	payload, err := json.Marshal(state)
	if err != nil {
		return
	}
	msg := &Message{Type: MediaSync, Payload: payload}

	client.queueMessage(msg)
}

func (h *Hub) canManageMediaRoute(client *Client, route string) bool {
	if client == nil || client.UserID == 0 {
		return false
	}
	if h.hasPermission(client, "home.manage") {
		return true
	}
	ownerID, ok := streammeta.DefaultStore.OwnerIDForRoute(route)
	return ok && ownerID == client.UserID
}

// cleanupInactiveMedia removes media state for routes that have been paused/empty and inactive for over 2 hours.
func (h *Hub) cleanupInactiveMedia() {
	h.mediaMu.Lock()
	defer h.mediaMu.Unlock()
	now := time.Now().UTC()
	for route, state := range h.mediaRoutes {
		t, err := time.Parse(time.RFC3339, state.UpdatedAt)
		if err == nil && now.Sub(t) > 2*time.Hour && (state.IsPaused || len(state.Queue) == 0) {
			delete(h.mediaRoutes, route)
		}
	}
}

// getOrCreateMediaState safely fetches or creates media state for a route.
func (h *Hub) getOrCreateMediaState(route string) *MediaState {
	h.mediaMu.RLock()
	state, exists := h.mediaRoutes[route]
	h.mediaMu.RUnlock()

	if exists {
		return state
	}

	// Not found, lock for write
	h.mediaMu.Lock()
	defer h.mediaMu.Unlock()

	// Double-check
	state, exists = h.mediaRoutes[route]
	if exists {
		return state
	}

	history, err := h.mediaRepo.LoadHistory(route)
	if err != nil {
		log.Printf("ws: failed to load media history for route %s: %v", route, err)
		history = []MediaItem{}
	}

	state = &MediaState{
		Route:           route,
		Queue:           []MediaItem{},
		History:         history,
		IsPaused:        false,
		CurrentPosition: 0,
		UpdatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
	recalculatePlaylists(state)
	h.mediaRoutes[route] = state
	return state
}

// recalculatePlaylists groups history items into playlists based on a 30-minute interval.
func recalculatePlaylists(state *MediaState) {
	state.Playlists = []MediaPlaylist{}
	if len(state.History) == 0 {
		return
	}

	var currentPlaylist *MediaPlaylist
	var lastTime time.Time

	for _, item := range state.History {
		t, err := time.Parse(time.RFC3339, item.CreatedAt)
		if err != nil {
			t = time.Now()
		}

		if currentPlaylist == nil {
			currentPlaylist = &MediaPlaylist{
				ID:        generateID(),
				StartTime: item.CreatedAt,
				Items:     []MediaItem{item},
			}
			lastTime = t
		} else {
			diff := lastTime.Sub(t)
			if diff <= 30*time.Minute && diff >= -30*time.Minute {
				currentPlaylist.Items = append(currentPlaylist.Items, item)
				currentPlaylist.StartTime = item.CreatedAt
				lastTime = t
			} else {
				state.Playlists = append(state.Playlists, *currentPlaylist)
				currentPlaylist = &MediaPlaylist{
					ID:        generateID(),
					StartTime: item.CreatedAt,
					Items:     []MediaItem{item},
				}
				lastTime = t
			}
		}
	}
	if currentPlaylist != nil {
		state.Playlists = append(state.Playlists, *currentPlaylist)
	}
}
