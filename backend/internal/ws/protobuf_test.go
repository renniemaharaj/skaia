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
