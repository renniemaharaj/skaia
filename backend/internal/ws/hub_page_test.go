package ws

import "testing"

func TestPropagatePageExceptUserTargetsSubscribersWithoutEcho(t *testing.T) {
	hub := NewHub()
	sender := &Client{UserID: 7, Send: make(chan []byte, 1)}
	recipient := &Client{UserID: 8, Send: make(chan []byte, 1)}
	otherPage := &Client{UserID: 9, Send: make(chan []byte, 1)}
	hub.handleSubscribe(ResourceSubscription{Client: sender, ResourceType: "page", ResourceID: 42})
	hub.handleSubscribe(ResourceSubscription{Client: recipient, ResourceType: "page", ResourceID: 42})
	hub.handleSubscribe(ResourceSubscription{Client: otherPage, ResourceType: "page", ResourceID: 99})

	hub.PropagatePageExceptUser(42, 7, "page_updated", map[string]any{
		"id": 42, "partial": true, "section_revisions": []map[string]int64{{"id": 3, "revision": 2}},
	})

	if len(sender.Send) != 0 {
		t.Fatal("originating user received a duplicate page invalidation")
	}
	if len(recipient.Send) != 1 {
		t.Fatal("subscribed collaborator did not receive the page invalidation")
	}
	if len(otherPage.Send) != 0 {
		t.Fatal("unrelated page subscriber received the invalidation")
	}
}
