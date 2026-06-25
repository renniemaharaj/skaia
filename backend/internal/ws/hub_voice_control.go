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
			VoiceEnabled: true,
			MutedUsers:   make(map[int64]bool),
			KickedUsers:  make(map[int64]bool),
		}
		h.voiceRoutes[vc.Payload.Route] = vp
	}

	switch vc.Payload.Action {
	case "enable":
		vp.VoiceEnabled = true
	case "disable":
		vp.VoiceEnabled = false
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
			select {
			case client.Send <- msg:
			default:
			}
		}
	}
}
