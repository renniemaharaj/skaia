package ws

import (
	"errors"
	"testing"
)

func TestDocumentationSubscriptionsFailClosed(t *testing.T) {
	client := &Client{UserID: 42}
	if err := (SubscriptionPolicy{}).Authorize(client, "documentation", 7); !errors.Is(err, ErrSubscriptionDenied) {
		t.Fatalf("missing documentation policy callback returned %v", err)
	}

	policy := SubscriptionPolicy{
		CanViewDocumentation: func(documentationID, userID int64) error {
			if documentationID != 7 || userID != 42 {
				return errors.New("denied")
			}
			return nil
		},
	}
	if err := policy.Authorize(client, "documentation", 7); err != nil {
		t.Fatalf("authorized documentation subscription returned %v", err)
	}
	if err := policy.Authorize(client, "documentation", 8); !errors.Is(err, ErrSubscriptionDenied) {
		t.Fatalf("denied documentation subscription returned %v", err)
	}
}
