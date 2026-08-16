package testutil

import (
	"database/sql"
	"testing"
)

func TestRunMigrationsIdempotentAndBaselineSynced(t *testing.T) {
	db := OpenTestDB(t)

	RunMigrations(t, db)

	for _, column := range []struct {
		table string
		name  string
	}{
		{"users", "background_image_url"},
		{"users", "profile_card_art_url"},
		{"roles", "theme_color"},
		{"roles", "glow_color"},
		{"forum_categories", "is_pinned"},
		{"products", "deleted_at"},
		{"cart_items", "inactive_at"},
		{"sessions", "revoked_at"},
		{"auth_backup_codes", "cleared_at"},
	} {
		requireColumn(t, db, column.table, column.name)
	}

	for _, table := range []string{"sessions", "media_history"} {
		requireTable(t, db, table)
	}
	for _, table := range []string{
		"page_themes", "page_theme_tokens",
		"page_section_instances", "page_section_color_references",
		"page_section_instance_items", "page_section_presets",
		"page_section_responses", "page_section_response_migrations",
		"page_section_quarantine", "page_section_shadow_runs",
	} {
		requireTableAbsent(t, db, table)
	}

	key := UniqueStr("hard_delete_guard")
	if _, err := db.Exec(`INSERT INTO site_config(key,value) VALUES ($1,'{}'::jsonb)`, key); err != nil {
		t.Fatalf("seed hard-delete guard row: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM site_config WHERE key=$1`, key); err == nil {
		t.Fatal("application connection bypassed the hard-delete guard")
	}
}

func requireTableAbsent(t *testing.T, db *sql.DB, tableName string) {
	t.Helper()
	var exists bool
	if err := db.QueryRow(`SELECT to_regclass('public.' || $1) IS NOT NULL`, tableName).Scan(&exists); err != nil {
		t.Fatalf("table absence check %s: %v", tableName, err)
	}
	if exists {
		t.Fatalf("retired table %s still exists", tableName)
	}
}

func requireColumn(t *testing.T, db *sql.DB, tableName, columnName string) {
	t.Helper()

	var exists bool
	err := db.QueryRow(
		`SELECT EXISTS (
		     SELECT 1
		     FROM information_schema.columns
		     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
		 )`,
		tableName,
		columnName,
	).Scan(&exists)
	if err != nil {
		t.Fatalf("column check %s.%s: %v", tableName, columnName, err)
	}
	if !exists {
		t.Fatalf("expected column %s.%s to exist", tableName, columnName)
	}
}

func requireTable(t *testing.T, db *sql.DB, tableName string) {
	t.Helper()

	var exists bool
	err := db.QueryRow(
		`SELECT EXISTS (
		     SELECT 1
		     FROM information_schema.tables
		     WHERE table_schema = 'public' AND table_name = $1
		 )`,
		tableName,
	).Scan(&exists)
	if err != nil {
		t.Fatalf("table check %s: %v", tableName, err)
	}
	if !exists {
		t.Fatalf("expected table %s to exist", tableName)
	}
}
