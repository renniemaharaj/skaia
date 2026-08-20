package models

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestPublicUserProfileExcludesPrivateAccountState(t *testing.T) {
	profile := NewPublicUserProfile(&User{
		ID: 4, Username: "reader", Email: "private@example.test", DisplayName: "Reader",
		IsSuspended: true, SuspendedReason: ptr("private"), EmailVerified: true,
		Permissions: []string{"admin.general"}, CreatedAt: time.Now(),
	})
	data, err := json.Marshal(profile)
	if err != nil {
		t.Fatal(err)
	}
	encoded := string(data)
	for _, forbidden := range []string{"private@example.test", "is_suspended", "suspended_reason", "email_verified", "permissions"} {
		if strings.Contains(encoded, forbidden) {
			t.Fatalf("public profile leaked %q: %s", forbidden, encoded)
		}
	}
}

func ptr(value string) *string { return &value }
