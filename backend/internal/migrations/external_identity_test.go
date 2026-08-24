package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestExternalIdentityMigrationContract(t *testing.T) {
	contents, err := os.ReadFile("041_external_identities.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(contents)
	for _, required := range []string{"external_identity_providers", "external_identity_challenges", "external_identity_links", "external_identity_events", "token_hash BYTEA", "session_hash BYTEA", "WHERE unlinked_at IS NULL", "skaia_reject_hard_delete"} {
		if !strings.Contains(sql, required) {
			t.Errorf("migration missing %q", required)
		}
	}
	if strings.Contains(strings.ToLower(sql), "access_token") || strings.Contains(strings.ToLower(sql), "refresh_token") {
		t.Fatal("identity schema must not persist provider credentials")
	}
}
