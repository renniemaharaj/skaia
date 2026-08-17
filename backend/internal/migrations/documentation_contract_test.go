package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestDocumentationSchemaHasFreshAndIncrementalParity(t *testing.T) {
	fresh, err := os.ReadFile("001_schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	bridge, err := os.ReadFile("036_documentation_hub.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"documentations", "documentation_sections", "documentation_articles"} {
		needle := "CREATE TABLE IF NOT EXISTS " + table
		if !strings.Contains(string(fresh), needle) {
			t.Errorf("fresh schema missing %s", table)
		}
		if !strings.Contains(string(bridge), needle) {
			t.Errorf("migration 036 missing %s", table)
		}
	}
	for _, contract := range []string{"docs.create", "docs.manage", "documentation_articles_active_slug_unique", "skaia_reject_hard_delete"} {
		if !strings.Contains(string(bridge), contract) {
			t.Errorf("migration 036 missing %s", contract)
		}
	}
}
