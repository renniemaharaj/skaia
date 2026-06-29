package ws

import (
	"encoding/json"
	"testing"

	wspb "github.com/skaia/grpc/ws"
	"google.golang.org/protobuf/proto"
)

func TestProtoMessageRoundTrip(t *testing.T) {
	payload := json.RawMessage(`{"action":"subscribe","resource_id":42}`)
	in := &Message{
		Type:    Subscribe,
		UserID:  7,
		Payload: payload,
	}

	data, err := encodeProtoMessage(in)
	if err != nil {
		t.Fatalf("encodeProtoMessage() error = %v", err)
	}

	out, err := decodeProtoMessage(data)
	if err != nil {
		t.Fatalf("decodeProtoMessage() error = %v", err)
	}

	if out.Type != in.Type {
		t.Fatalf("type = %q, want %q", out.Type, in.Type)
	}
	if out.UserID != in.UserID {
		t.Fatalf("userID = %d, want %d", out.UserID, in.UserID)
	}
	if string(out.Payload) != string(in.Payload) {
		t.Fatalf("payload = %s, want %s", out.Payload, in.Payload)
	}
}

func TestProtoServerMessageEncode(t *testing.T) {
	payload := json.RawMessage(`{"action":"presence_updated"}`)
	in := &Message{
		Type:    PresenceSync,
		UserID:  9,
		Payload: payload,
	}

	data, err := encodeProtoServerMessage(in)
	if err != nil {
		t.Fatalf("encodeProtoServerMessage() error = %v", err)
	}

	var out wspb.ServerMessage
	if err := proto.Unmarshal(data, &out); err != nil {
		t.Fatalf("unmarshal ServerMessage: %v", err)
	}

	if out.GetType() != string(in.Type) {
		t.Fatalf("type = %q, want %q", out.GetType(), in.Type)
	}
	if out.GetUserId() != in.UserID {
		t.Fatalf("userID = %d, want %d", out.GetUserId(), in.UserID)
	}
	if string(out.GetPayload()) != string(in.Payload) {
		t.Fatalf("payload = %s, want %s", out.GetPayload(), in.Payload)
	}
}

func TestHandleVoiceSignalRelaysToTargetOnly(t *testing.T) {
	h := NewHub()
	sender := &Client{UserID: 42, SessionID: 1, Route: "/room", Send: make(chan []byte, 1)}
	target := &Client{UserID: 7, SessionID: 1, Route: "/room", Send: make(chan []byte, 1)}
	other := &Client{UserID: 9, SessionID: 1, Route: "/room", Send: make(chan []byte, 1)}
	h.clients[sender] = true
	h.clients[target] = true
	h.clients[other] = true

	h.handleWebRTCMessage(sender, VoiceSignalPayload{
		Route:        "/room",
		TargetUserID: 7,
		Kind:         "offer",
		SDP:          "v=0",
	})

	select {
	case data := <-target.Send:
		msg, err := decodeProtoMessage(data)
		if err != nil {
			t.Fatalf("decode queued signal: %v", err)
		}
		if msg.Type != VoiceSignal {
			t.Fatalf("type = %s, want %s", msg.Type, VoiceSignal)
		}
		var payload VoiceSignalPayload
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			t.Fatalf("unmarshal signal payload: %v", err)
		}
		if payload.SenderUserID != 42 || payload.TargetUserID != 7 {
			t.Fatalf("payload = %+v, want sender 42 target 7", payload)
		}
	default:
		t.Fatal("target did not receive voice signal")
	}

	select {
	case <-other.Send:
		t.Fatal("non-target received voice signal")
	default:
	}
}

func TestHandleVoiceSignalRejectsCrossRoute(t *testing.T) {
	h := NewHub()
	sender := &Client{UserID: 42, SessionID: 1, Route: "/room-a", Send: make(chan []byte, 1)}
	target := &Client{UserID: 7, SessionID: 1, Route: "/room-b", Send: make(chan []byte, 1)}
	h.clients[sender] = true
	h.clients[target] = true

	h.handleWebRTCMessage(sender, VoiceSignalPayload{
		Route:        "/room-b",
		TargetUserID: 7,
		Kind:         "offer",
		SDP:          "v=0",
	})

	select {
	case <-target.Send:
		t.Fatal("cross-route signal was delivered")
	default:
	}
}
