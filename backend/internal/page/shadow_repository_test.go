package page

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
)

func TestSQLRepositoryMaintainsIdempotentPageSectionShadow(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := NewRepository(db)
	page := &models.Page{
		Slug: "shadow-page-" + uuid.NewString(), Title: "Shadow", Visibility: "private",
		Content: `[
			{"id":"hero-a","display_order":0,"section_type":"hero","heading":"Hero","subheading":"",
			 "config":{"layout":"wide","tint_color":"#112233","tint_opacity":0.4,"variant":2}},
			{"id":22,"display_order":1,"section_type":"card_group","heading":"Cards","subheading":"",
			 "config":{},"items":[{"id":"card-a","section_id":22,"display_order":0,"heading":"Card","image_url":"/fixture.webp","config":{}}]}
		]`,
	}
	if err := repo.Create(page); err != nil {
		t.Fatal(err)
	}
	firstIDs := shadowSectionIDs(t, db, page.ID)
	if len(firstIDs) != 2 {
		t.Fatalf("expected two shadow sections, got %v", firstIDs)
	}
	var status string
	var runCount int
	if err := db.QueryRow(`SELECT status, run_count FROM page_section_shadow_runs WHERE page_id=$1`, page.ID).Scan(&status, &runCount); err != nil {
		t.Fatal(err)
	}
	if status != "matched" || runCount != 1 {
		t.Fatalf("unexpected initial shadow run: status=%s count=%d", status, runCount)
	}

	page.Content = `[
		{"id":22,"display_order":0,"section_type":"card_group","heading":"Cards updated","subheading":"","config":{},"items":[]},
		{"id":"hero-a","display_order":1,"section_type":"hero","heading":"Hero","subheading":"","config":{"layout":"center"}}
	]`
	if err := repo.UpdatePreservingInteractive(page); err != nil {
		t.Fatal(err)
	}
	secondIDs := shadowSectionIDs(t, db, page.ID)
	if firstIDs["number:22"] != secondIDs["number:22"] || firstIDs["string:hero-a"] != secondIDs["string:hero-a"] {
		t.Fatalf("idempotent upsert did not retain server IDs: before=%v after=%v", firstIDs, secondIDs)
	}
	var itemCount int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM page_section_instance_items i JOIN page_section_instances s ON s.id=i.section_id WHERE s.page_id=$1`,
		page.ID,
	).Scan(&itemCount); err != nil {
		t.Fatal(err)
	}
	if itemCount != 0 {
		t.Fatalf("stale shadow items were not deleted: %d", itemCount)
	}
	if err := db.QueryRow(`SELECT run_count FROM page_section_shadow_runs WHERE page_id=$1`, page.ID).Scan(&runCount); err != nil {
		t.Fatal(err)
	}
	if runCount != 2 {
		t.Fatalf("expected idempotent run count 2, got %d", runCount)
	}
	var legacyWriteCount int
	if err := db.QueryRow(`SELECT legacy_write_count FROM page_section_shadow_runs WHERE page_id=$1`, page.ID).Scan(&legacyWriteCount); err != nil {
		t.Fatal(err)
	}
	if legacyWriteCount != 1 {
		t.Fatalf("legacy compatibility write telemetry = %d, want 1", legacyWriteCount)
	}
}

func TestShadowPaletteReferenceAndBoundedBackfill(t *testing.T) {
	db := testutil.OpenTestDB(t)
	slug := "shadow-backfill-" + uuid.NewString()
	var pageID int64
	content := `[{"id":1,"display_order":0,"section_type":"cta","heading":"CTA","subheading":"","config":{"background_color":{"mode":"palette","token":"brand"}}}]`
	if err := db.QueryRow(
		`INSERT INTO pages (slug,title,visibility,content) VALUES ($1,'Backfill','private',$2::jsonb) RETURNING id`, slug, content,
	).Scan(&pageID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO page_themes (page_id) VALUES ($1)`, pageID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`INSERT INTO page_theme_tokens (page_id,token_key,label,color_value,display_order) VALUES ($1,'brand','Brand','#123456',0)`, pageID,
	); err != nil {
		t.Fatal(err)
	}
	result, err := BackfillPageSectionShadow(context.Background(), db, pageID-1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if result.Scanned != 1 || result.NextAfterID != pageID || result.Matched != 1 {
		t.Fatalf("unexpected backfill result: %#v", result)
	}
	var referenceCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM page_section_color_references WHERE page_id=$1 AND token_key='brand'`, pageID).Scan(&referenceCount); err != nil {
		t.Fatal(err)
	}
	if referenceCount != 1 {
		t.Fatalf("expected palette reference, got %d", referenceCount)
	}
	if _, err := db.Exec(`DELETE FROM page_theme_tokens WHERE page_id=$1 AND token_key='brand'`, pageID); err == nil {
		t.Fatal("referenced palette token deletion did not fail closed")
	}
	if _, err := BackfillPageSectionShadow(context.Background(), db, pageID, 0); err == nil {
		t.Fatal("invalid backfill batch size was accepted")
	}
}

func TestShadowPersistenceDoesNotCopyInteractiveResponses(t *testing.T) {
	db := testutil.OpenTestDB(t)
	page := &models.Page{
		Slug: "shadow-runtime-" + uuid.NewString(), Title: "Runtime", Visibility: "private",
		Content: `[{"id":7,"display_order":0,"section_type":"poll","heading":"Poll","subheading":"",
			"config":{"status":"open","submit_label":"Vote","success_text":"Recorded",
			"result_visibility":"after_participation","response_limit":1,
			"fields":[{"key":"choice","type":"radio","label":"Choose"}],
			"records":[{"id":"response-secret","answers":{"choice":"private-answer"},"idempotency_key":"private-key"}],
			"result_summary":{"total":1}}}]`,
	}
	if err := db.QueryRow(
		`INSERT INTO pages (slug,title,visibility,content) VALUES ($1,$2,$3,$4::jsonb)
		 RETURNING id,created_at,updated_at`,
		page.Slug, page.Title, page.Visibility, page.Content,
	).Scan(&page.ID, &page.CreatedAt, &page.UpdatedAt); err != nil {
		t.Fatal(err)
	}
	report, err := SyncPageSectionShadow(context.Background(), db, page)
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != "matched" {
		t.Fatalf("runtime-free definition should match: %#v", report)
	}
	var configText, quarantineText string
	if err := db.QueryRow(
		`SELECT config::text,quarantined_config::text FROM page_section_instances WHERE page_id=$1`, page.ID,
	).Scan(&configText, &quarantineText); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"response-secret", "private-answer", "private-key", "records", "result_summary"} {
		if strings.Contains(configText+quarantineText, secret) {
			t.Fatalf("interactive runtime reached normalized section storage: %s %s", configText, quarantineText)
		}
	}
	var responseCount int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM page_section_responses r JOIN page_section_instances s ON s.id=r.section_id WHERE s.page_id=$1`, page.ID,
	).Scan(&responseCount); err != nil {
		t.Fatal(err)
	}
	if responseCount != 0 {
		t.Fatalf("Phase 4 copied %d responses before the Phase 6 sensitive migration", responseCount)
	}
}

func shadowSectionIDs(t *testing.T, db *sql.DB, pageID int64) map[string]int64 {
	t.Helper()
	rows, err := db.Query(`SELECT id,legacy_key_kind,legacy_key FROM page_section_instances WHERE page_id=$1`, pageID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	result := map[string]int64{}
	for rows.Next() {
		var id int64
		var kind, value string
		if err := rows.Scan(&id, &kind, &value); err != nil {
			t.Fatal(err)
		}
		result[kind+":"+value] = id
	}
	return result
}
