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
		{"page_section_responses", "respondent_user_key"},
		{"page_section_responses", "respondent_name"},
		{"page_section_responses", "moderator_answer"},
		{"page_section_responses", "pinned"},
		{"page_section_shadow_runs", "consecutive_matched_runs"},
		{"page_section_shadow_runs", "rollback_status"},
		{"page_section_shadow_runs", "cutover_ready_at"},
		{"page_section_shadow_runs", "legacy_write_count"},
	} {
		requireColumn(t, db, column.table, column.name)
	}

	for _, table := range []string{
		"sessions", "media_history", "page_themes", "page_theme_tokens",
		"page_section_instances", "page_section_color_references",
		"page_section_instance_items", "page_section_presets",
		"page_section_responses", "page_section_response_migrations",
		"page_section_quarantine", "page_section_shadow_runs",
	} {
		requireTable(t, db, table)
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
