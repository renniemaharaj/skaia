package migrations

import (
	"database/sql"
	"encoding/json"
	"os"
	"strings"
	"testing"

	_ "github.com/lib/pq"
	"github.com/skaia/backend/internal/s_registry"
)

func dollarQuoted(t *testing.T, source, tag string) string {
	t.Helper()
	delimiter := "$" + tag + "$"
	start := strings.Index(source, delimiter)
	if start < 0 {
		t.Fatalf("missing opening %s delimiter", delimiter)
	}
	start += len(delimiter)
	end := strings.Index(source[start:], delimiter)
	if end < 0 {
		t.Fatalf("missing closing %s delimiter", delimiter)
	}
	return strings.TrimSpace(source[start : start+end])
}

func TestGoWebPlatformGetStartedMigrationDatabaseBehavior(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set - skipping integration test")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"001_schema.sql", "002_seed.sql"} {
		contents, readErr := os.ReadFile(name)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, execErr := db.Exec(string(contents)); execErr != nil {
			t.Fatalf("apply %s: %v", name, execErr)
		}
	}
	migrationBytes, err := os.ReadFile("048_go_web_platform_get_started.sql")
	if err != nil {
		t.Fatal(err)
	}
	migration := string(migrationBytes)
	legacy := dollarQuoted(t, migration, "legacy")
	want := dollarQuoted(t, migration, "gwp")

	var title, content, landing string
	if err := db.QueryRow(`SELECT title,content::text FROM pages WHERE slug='get-started'`).Scan(&title, &content); err != nil {
		t.Fatal(err)
	}
	if title != "Go Web Platform" || normalizedJSON(t, content) != normalizedJSON(t, want) {
		t.Fatal("fresh migrations did not produce the current GWP get-started seed")
	}
	if err := db.QueryRow(`SELECT value #>> '{}' FROM site_config WHERE key='landing_page_slug' AND deleted_at IS NULL`).Scan(&landing); err != nil {
		t.Fatal(err)
	}
	if landing != "get-started" {
		t.Fatalf("fresh landing_page_slug = %q, want get-started", landing)
	}

	if _, err := db.Exec(`UPDATE pages SET title='Get Started',description='A quick tour of the page builder blocks available on your site.',content=$1::jsonb,visibility='public',owner_id=NULL,seo_title='',seo_description='',seo_image='',deleted_at=NULL WHERE slug='get-started'`, legacy); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE site_config SET value='"another-home"'::jsonb WHERE key='landing_page_slug'`); err != nil {
		t.Fatal(err)
	}
	result, err := db.Exec(migration)
	if err != nil {
		t.Fatal(err)
	}
	if rows, _ := result.RowsAffected(); rows != 1 {
		t.Fatalf("pristine legacy update affected %d rows, want 1", rows)
	}
	result, err = db.Exec(migration)
	if err != nil {
		t.Fatal(err)
	}
	if rows, _ := result.RowsAffected(); rows != 0 {
		t.Fatalf("second migration affected %d rows, want 0", rows)
	}
	if err := db.QueryRow(`SELECT value #>> '{}' FROM site_config WHERE key='landing_page_slug' AND deleted_at IS NULL`).Scan(&landing); err != nil {
		t.Fatal(err)
	}
	if landing != "another-home" {
		t.Fatalf("migration changed landing_page_slug to %q", landing)
	}

	if _, err := db.Exec(`UPDATE pages SET title='Tenant welcome',description='A quick tour of the page builder blocks available on your site.',content=$1::jsonb,visibility='public',owner_id=NULL,seo_title='',seo_description='',seo_image='',deleted_at=NULL WHERE slug='get-started'`, legacy); err != nil {
		t.Fatal(err)
	}
	result, err = db.Exec(migration)
	if err != nil {
		t.Fatal(err)
	}
	if rows, _ := result.RowsAffected(); rows != 0 {
		t.Fatalf("customized legacy page update affected %d rows, want 0", rows)
	}
	if err := db.QueryRow(`SELECT title,content::text FROM pages WHERE slug='get-started'`).Scan(&title, &content); err != nil {
		t.Fatal(err)
	}
	if title != "Tenant welcome" || normalizedJSON(t, content) != normalizedJSON(t, legacy) {
		t.Fatal("customized get-started page was not preserved")
	}
}

func currentSeedContent(t *testing.T, source string) string {
	t.Helper()
	marker := "SELECT 'get-started', 'Go Web Platform', 'Build, publish, connect, and grow with the capabilities included in Go Web Platform.',"
	start := strings.Index(source, marker)
	if start < 0 {
		t.Fatal("current get-started seed marker is missing")
	}
	start = strings.Index(source[start:], "'[") + start + 1
	if start == 0 {
		t.Fatal("current get-started JSON start is missing")
	}
	endMarker := "]'::jsonb, 'public'"
	end := strings.Index(source[start:], endMarker)
	if end < 0 {
		t.Fatal("current get-started JSON end is missing")
	}
	return strings.TrimSpace(source[start : start+end+1])
}

func normalizedJSON(t *testing.T, raw string) string {
	t.Helper()
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("encode JSON: %v", err)
	}
	return string(encoded)
}

func TestGoWebPlatformGetStartedMigrationIsPristineOnlyAndValid(t *testing.T) {
	seedBytes, err := os.ReadFile("002_seed.sql")
	if err != nil {
		t.Fatal(err)
	}
	migrationBytes, err := os.ReadFile("048_go_web_platform_get_started.sql")
	if err != nil {
		t.Fatal(err)
	}
	migration := string(migrationBytes)

	legacy := dollarQuoted(t, migration, "legacy")
	for _, required := range []string{"Welcome to Your Site", "Feature Highlights", "Ready to build?"} {
		if !strings.Contains(legacy, required) {
			t.Errorf("migration legacy signature missing %q", required)
		}
	}

	content := dollarQuoted(t, migration, "gwp")
	if got, want := normalizedJSON(t, content), normalizedJSON(t, currentSeedContent(t, string(seedBytes))); got != want {
		t.Fatal("migration 048 document drifted from migration 002 fresh seed")
	}
	if err := s_registry.ValidateContent(content, nil); err != nil {
		t.Fatalf("new get-started document is invalid: %v", err)
	}
	for _, required := range []string{
		"Go Web Platform",
		"Data-powered sections",
		"Participation tools",
		"Community workflows",
		"Commerce and rewards",
		"Meet in real time",
		"Designed to become your platform",
	} {
		if !strings.Contains(content, required) {
			t.Errorf("new get-started document missing %q", required)
		}
	}
	for _, forbidden := range []string{"link_url\": \"/", "section_type\": \"form\"", "section_type\": \"poll\""} {
		if strings.Contains(content, forbidden) {
			t.Errorf("new get-started document contains unsafe public action %q", forbidden)
		}
	}

	for _, guard := range []string{
		"page.content = legacy_seed.content",
		"page.owner_id IS NULL",
		"page.visibility = 'public'",
		"page.seo_title = ''",
		"page.deleted_at IS NULL",
	} {
		if !strings.Contains(migration, guard) {
			t.Errorf("migration missing pristine guard %q", guard)
		}
	}
}
