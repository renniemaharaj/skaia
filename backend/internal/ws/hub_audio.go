package ws

import (
	"encoding/binary"
)

// handleAudioBroadcast relays a binary audio frame to every other client
// on the same route. It prepends the sender's UserID to the frame payload.
func (h *Hub) handleAudioBroadcast(ab AudioBroadcast) {
	sender := ab.Client

	h.mu.RLock()
	route := sender.Route
	if route == "" {
		h.mu.RUnlock()
		return
	}
	targets := make([]*Client, 0)
	for client := range h.clients {
		if client != sender && client.Route == route {
			targets = append(targets, client)
		}
	}
	h.mu.RUnlock()

	// Calculate presence ID (negative for guests, positive for users)
	var presenceID int64
	if sender.UserID == 0 {
		presenceID = -sender.ClientID
	} else {
		presenceID = sender.UserID
	}

	h.voiceMu.RLock()
	vp, ok := h.voiceRoutes[route]
	voiceEnabled := true
	var muted bool
	var kicked bool
	if ok {
		voiceEnabled = vp.VoiceEnabled
		muted = vp.MutedUsers[presenceID]
		kicked = vp.KickedUsers[presenceID]
	}
	h.voiceMu.RUnlock()

	if !voiceEnabled || muted || kicked {
		return
	}

	// Pack the downstream binary frame:
	// Byte 0: Frame Type (0x01 = Mic, 0x02 = Media)
	// Byte 1-8: Sender ID (uint64 LittleEndian)
	// Byte 9-N: Opus/Audio payload
	outData := make([]byte, 1+8+len(ab.Data))
	outData[0] = ab.Type
	binary.LittleEndian.PutUint64(outData[1:9], uint64(presenceID))
	copy(outData[9:], ab.Data)

	for _, client := range targets {
		select {
		case client.AudioSend <- outData:
		default:
			// Audio is UDP-like in nature, if client is lagging, drop frame
		}
	}
}
