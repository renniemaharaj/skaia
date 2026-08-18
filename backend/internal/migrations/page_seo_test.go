package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestPageSEOSchemaHasFreshAndIncrementalParity(t *testing.T) {
	fresh, err := os.ReadFile("001_schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	incremental, err := os.ReadFile("037_page_seo.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, column := range []string{"seo_title", "seo_description", "seo_image"} {
		if !strings.Contains(string(fresh), column) {
			t.Errorf("fresh schema missing pages.%s", column)
		}
		if !strings.Contains(string(incremental), column) {
			t.Errorf("migration 037 missing pages.%s", column)
		}
	}
}
