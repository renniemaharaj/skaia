package ws

import (
	"encoding/json"
	"testing"
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
