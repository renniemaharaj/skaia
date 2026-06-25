package ws

import (
	"encoding/json"
	"testing"
)

func TestHandleVoiceControlRequiresManagePermission(t *testing.T) {
	h := NewHub()
	admin := &Client{
		UserID:      1,
		Route:       "/room",
		Permissions: []string{"home.manage"},
		Send:        make(chan []byte, 1),
	}
	viewer := &Client{UserID: 2, Route: "/room", Send: make(chan []byte, 1)}
	h.clients[admin] = true
	h.clients[viewer] = true

	h.handleVoiceControl(VoiceControlAction{
		Client: admin,
		Payload: VoiceControlPayload{
			Route:  "/room",
			Action: "disable",
		},
	})

	if h.voiceRoutes["/room"].VoiceEnabled {
		t.Fatal("route voice remained enabled after admin disabled it")
	}

	select {
	case data := <-viewer.Send:
		msg, err := decodeProtoMessage(data)
		if err != nil {
			t.Fatalf("decode queued message: %v", err)
		}
		if msg.Type != VoiceControl {
			t.Fatalf("message type = %s, want %s", msg.Type, VoiceControl)
		}
		var payload VoiceControlPayload
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			t.Fatalf("unmarshal payload: %v", err)
		}
		if payload.Action != "disable" || payload.Route != "/room" {
			t.Fatalf("payload = %+v, want disable /room", payload)
		}
	default:
		t.Fatal("viewer did not receive voice control update")
	}
}

func TestHandleVoiceControlRejectsNonAdmin(t *testing.T) {
	h := NewHub()
	client := &Client{UserID: 1, Route: "/room", Send: make(chan []byte, 1)}
	h.clients[client] = true

	h.handleVoiceControl(VoiceControlAction{
		Client:  client,
		Payload: VoiceControlPayload{Route: "/room", Action: "disable"},
	})

	if _, ok := h.voiceRoutes["/room"]; ok {
		t.Fatal("non-admin created voice permissions for route")
	}
}
