package ws

import (
	"encoding/binary"
	"encoding/json"
	"testing"
)

func TestHandleAudioBroadcastRoutesToSameRoute(t *testing.T) {
	h := NewHub()
	sender := &Client{ClientID: 1, Route: "/room", AudioSend: make(chan []byte, 1)}
	target := &Client{ClientID: 2, Route: "/room", AudioSend: make(chan []byte, 1)}
	elsewhere := &Client{ClientID: 3, Route: "/elsewhere", AudioSend: make(chan []byte, 1)}

	h.clients[sender] = true
	h.clients[target] = true
	h.clients[elsewhere] = true

	h.handleAudioBroadcast(AudioBroadcast{
		Client: sender,
		Type:   0x01,
		Data:   []byte{0xaa, 0xbb},
	})

	select {
	case frame := <-target.AudioSend:
		if got := frame[0]; got != 0x01 {
			t.Fatalf("frame type = %x, want 0x01", got)
		}
		if got := int64(binary.LittleEndian.Uint64(frame[1:9])); got != -1 {
			t.Fatalf("sender presence id = %d, want -1", got)
		}
		if got := frame[9:]; string(got) != string([]byte{0xaa, 0xbb}) {
			t.Fatalf("payload = %v, want [170 187]", got)
		}
	default:
		t.Fatal("same-route target did not receive audio frame")
	}

	select {
	case <-sender.AudioSend:
		t.Fatal("sender received its own audio frame")
	default:
	}

	select {
	case <-elsewhere.AudioSend:
		t.Fatal("different-route client received audio frame")
	default:
	}
}

func TestHandleAudioBroadcastDropsDisabledMutedAndKicked(t *testing.T) {
	tests := []struct {
		name string
		perm VoicePermissions
	}{
		{
			name: "disabled",
			perm: VoicePermissions{VoiceEnabled: false, MutedUsers: map[int64]bool{}, KickedUsers: map[int64]bool{}},
		},
		{
			name: "muted",
			perm: VoicePermissions{VoiceEnabled: true, MutedUsers: map[int64]bool{42: true}, KickedUsers: map[int64]bool{}},
		},
		{
			name: "kicked",
			perm: VoicePermissions{VoiceEnabled: true, MutedUsers: map[int64]bool{}, KickedUsers: map[int64]bool{42: true}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := NewHub()
			sender := &Client{UserID: 42, Route: "/room", AudioSend: make(chan []byte, 1)}
			target := &Client{UserID: 7, Route: "/room", AudioSend: make(chan []byte, 1)}
			h.clients[sender] = true
			h.clients[target] = true
			h.voiceRoutes["/room"] = &tt.perm

			h.handleAudioBroadcast(AudioBroadcast{Client: sender, Type: 0x01, Data: []byte{0x01}})

			select {
			case <-target.AudioSend:
				t.Fatal("target received audio frame that should have been dropped")
			default:
			}
		})
	}
}

func TestHandleVoiceControlRequiresManagePermission(t *testing.T) {
	h := NewHub()
	admin := &Client{
		UserID:      1,
		Route:       "/room",
		Permissions: []string{"home.manage"},
		Send:        make(chan *Message, 1),
	}
	viewer := &Client{UserID: 2, Route: "/room", Send: make(chan *Message, 1)}
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
	case msg := <-viewer.Send:
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
	client := &Client{UserID: 1, Route: "/room", Send: make(chan *Message, 1)}
	h.clients[client] = true

	h.handleVoiceControl(VoiceControlAction{
		Client:  client,
		Payload: VoiceControlPayload{Route: "/room", Action: "disable"},
	})

	if _, ok := h.voiceRoutes["/room"]; ok {
		t.Fatal("non-admin created voice permissions for route")
	}
}
