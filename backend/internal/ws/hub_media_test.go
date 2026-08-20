package ws

import (
	"context"
	"encoding/json"
	"testing"
)

func TestHandleMediaTransitionStartAndComplete(t *testing.T) {
	h := NewHub()
	h.AccountTrustAuthorizer = func(context.Context, int64) error { return nil }
	h.PermissionAuthorizer = func(int64, string) (bool, error) { return true, nil }
	client := &Client{UserID: 1, UserName: "Admin", Route: "/room", Permissions: []string{"home.manage"}, Send: make(chan []byte, 1)}

	h.mediaRoutes["/room"] = &MediaState{
		Route: "/room",
		Queue: []MediaItem{
			{ID: "current", VideoID: "aaaaaaaaaaa"},
			{ID: "next", VideoID: "bbbbbbbbbbb"},
		},
		History: []MediaItem{},
	}

	startPayload, err := json.Marshal(MediaClientAction{Route: "/room", ItemID: "next"})
	if err != nil {
		t.Fatalf("marshal start payload: %v", err)
	}
	h.handleMediaUpdate(MediaUpdateAction{
		Client:  client,
		Message: Message{Type: MediaTransitionStart, Payload: startPayload},
	})

	if got := h.mediaRoutes["/room"].TransitioningID; got != "next" {
		t.Fatalf("transitioning id = %q, want next", got)
	}

	completePayload, err := json.Marshal(MediaClientAction{Route: "/room", ItemID: "current", Position: 12.5})
	if err != nil {
		t.Fatalf("marshal complete payload: %v", err)
	}
	h.handleMediaUpdate(MediaUpdateAction{
		Client:  client,
		Message: Message{Type: MediaTransition, Payload: completePayload},
	})

	state := h.mediaRoutes["/room"]
	if len(state.Queue) != 1 || state.Queue[0].ID != "next" {
		t.Fatalf("queue = %+v, want only next item", state.Queue)
	}
	if state.TransitioningID != "" {
		t.Fatalf("transitioning id = %q, want cleared", state.TransitioningID)
	}
	if state.CurrentPosition != 12.5 {
		t.Fatalf("current position = %v, want 12.5", state.CurrentPosition)
	}
	if len(state.History) != 1 || state.History[0].ID != "current" {
		t.Fatalf("history = %+v, want current item", state.History)
	}
}

func TestHandleMediaUpdateRejectsGuestBeforeStateAllocation(t *testing.T) {
	h := NewHub()
	payload, err := json.Marshal(MediaClientAction{Route: "/guest-route", VideoID: "aaaaaaaaaaa"})
	if err != nil {
		t.Fatal(err)
	}
	h.handleMediaUpdate(MediaUpdateAction{
		Client:  &Client{Route: "/guest-route", Send: make(chan []byte, 1)},
		Message: Message{Type: MediaAdd, Payload: payload},
	})
	if len(h.mediaRoutes) != 0 {
		t.Fatalf("guest allocated media state: %#v", h.mediaRoutes)
	}
}

func TestHandleMediaUpdateRejectsCrossRouteActions(t *testing.T) {
	h := NewHub()
	client := &Client{UserID: 1, UserName: "User", Route: "/room-a", Send: make(chan []byte, 1)}

	payload, err := json.Marshal(MediaClientAction{Route: "/room-b", VideoID: "aaaaaaaaaaa"})
	if err != nil {
		t.Fatalf("marshal add payload: %v", err)
	}

	h.handleMediaUpdate(MediaUpdateAction{
		Client:  client,
		Message: Message{Type: MediaAdd, Payload: payload},
	})

	if _, exists := h.mediaRoutes["/room-b"]; exists {
		t.Fatal("cross-route media action created state for /room-b")
	}
	if _, exists := h.mediaRoutes["/room-a"]; exists {
		t.Fatal("cross-route media action mutated the client's own route")
	}
}
