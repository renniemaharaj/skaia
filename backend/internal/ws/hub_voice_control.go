package ws

import (
	"encoding/json"
	log "github.com/skaia/backend/internal/syslog"
)

// VoiceControlAction asks the hub to update voice permissions.
type VoiceControlAction struct {
	Client  *Client
	Payload VoiceControlPayload
}

// handleVoiceControl updates the admin permissions for voice chat on a specific route.
func (h *Hub) handleVoiceControl(vc VoiceControlAction) {
	if vc.Client == nil || !vc.Client.HasPermission("home.manage") {
		return
	}
	if vc.Payload.Route == "" {
		return
	}

	h.voiceMu.Lock()
	vp, ok := h.voiceRoutes[vc.Payload.Route]
	if !ok {
		vp = &VoicePermissions{
			VoiceEnabled:  true,
			GuestsAllowed: false,
			MutedUsers:    make(map[int64]bool),
			KickedUsers:   make(map[int64]bool),
		}
		h.voiceRoutes[vc.Payload.Route] = vp
	}

	switch vc.Payload.Action {
	case "enable":
		vp.VoiceEnabled = true
	case "disable":
		vp.VoiceEnabled = false
	case "allow_guests":
		vp.GuestsAllowed = true
	case "deny_guests":
		vp.GuestsAllowed = false
	case "mute":
		if vc.Payload.TargetUserID != 0 {
			vp.MutedUsers[vc.Payload.TargetUserID] = true
		}
	case "unmute":
		if vc.Payload.TargetUserID != 0 {
			delete(vp.MutedUsers, vc.Payload.TargetUserID)
		}
	case "kick":
		if vc.Payload.TargetUserID != 0 {
			vp.KickedUsers[vc.Payload.TargetUserID] = true
			// Also mute kicked users to prevent them from sending audio if they reconnect
			vp.MutedUsers[vc.Payload.TargetUserID] = true
		}
	default:
		log.Printf("ws: unknown voice control action: %s", vc.Payload.Action)
		h.voiceMu.Unlock()
		return
	}
	h.voiceMu.Unlock()

	// Broadcast the voice control update to all clients on that route
	outPayload, _ := json.Marshal(vc.Payload)
	msg := &Message{Type: VoiceControl, Payload: outPayload}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.Route == vc.Payload.Route {
			client.queueMessage(msg)
		}
	}
}

func (c *Client) handleWebRTCMessage(msg Message) {
	var payload VoiceSignalPayload
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	c.Hub.handleWebRTCMessage(c, payload)
}

func (h *Hub) handleWebRTCMessage(sender *Client, payload VoiceSignalPayload) {
	if sender == nil || payload.Route == "" || payload.TargetUserID == 0 {
		return
	}
	if payload.Route != sender.Route {
		return
	}
	switch payload.Kind {
	case "offer", "answer", "candidate", "leave", "hello":
	default:
		return
	}

	senderID := presenceID(sender)
	h.voiceMu.RLock()
	vp, ok := h.voiceRoutes[payload.Route]
	voiceEnabled := true
	guestsAllowed := false
	muted := false
	kicked := false
	if ok {
		voiceEnabled = vp.VoiceEnabled
		guestsAllowed = vp.GuestsAllowed
		muted = vp.MutedUsers[senderID]
		kicked = vp.KickedUsers[senderID]
	}
	h.voiceMu.RUnlock()
	if !voiceEnabled || muted || kicked {
		return
	}
	if sender.UserID == 0 && !guestsAllowed {
		return
	}

	payload.SenderUserID = senderID
	outPayload, err := json.Marshal(payload)
	if err != nil {
		return
	}
	msg := &Message{Type: VoiceSignal, UserID: senderID, Payload: outPayload}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client == sender || client.SessionID != sender.SessionID || client.Route != payload.Route {
			continue
		}
		if presenceID(client) == payload.TargetUserID {
			client.queueMessage(msg)
		}
	}
}

func presenceID(client *Client) int64 {
	if client.UserID == 0 {
		return -client.ClientID
	}
	return client.UserID
}

// GetVoicePermissions returns the current voice state for a route.
func (h *Hub) GetVoicePermissions(route string) *VoicePermissions {
	h.voiceMu.RLock()
	defer h.voiceMu.RUnlock()

	vp, ok := h.voiceRoutes[route]
	if !ok {
		return &VoicePermissions{
			VoiceEnabled:  true,
			GuestsAllowed: false,
			MutedUsers:    make(map[int64]bool),
			KickedUsers:   make(map[int64]bool),
		}
	}
	
	// Return a deep copy to prevent race conditions during JSON encoding
	muted := make(map[int64]bool, len(vp.MutedUsers))
	for k, v := range vp.MutedUsers {
		muted[k] = v
	}
	kicked := make(map[int64]bool, len(vp.KickedUsers))
	for k, v := range vp.KickedUsers {
		kicked[k] = v
	}
	
	return &VoicePermissions{
		VoiceEnabled:  vp.VoiceEnabled,
		GuestsAllowed: vp.GuestsAllowed,
		MutedUsers:    muted,
		KickedUsers:   kicked,
	}
}
