package page

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/skaia/backend/internal/s_registry"
	"github.com/skaia/backend/models"
)

type productionShapeFixture struct {
	FixtureVersion int    `json:"fixture_version"`
	SourceBaseline string `json:"source_baseline"`
	Pages          []struct {
		Fixture    string            `json:"fixture"`
		Visibility string            `json:"visibility"`
		Content    []json.RawMessage `json:"content"`
	} `json:"pages"`
	Presets []struct {
		Fixture     string          `json:"fixture"`
		SectionType string          `json:"section_type"`
		Config      json.RawMessage `json:"config"`
	} `json:"presets"`
}

func loadProductionShapeFixture(t *testing.T) (productionShapeFixture, []byte) {
	t.Helper()
	raw, err := os.ReadFile("testdata/production_page_shapes.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture productionShapeFixture
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture, raw
}

func fixturePage(t *testing.T, fixture productionShapeFixture, name string) []json.RawMessage {
	t.Helper()
	for _, page := range fixture.Pages {
		if page.Fixture == name {
			return page.Content
		}
	}
	t.Fatalf("fixture page %q not found", name)
	return nil
}

func decodeFixtureSection(t *testing.T, raw json.RawMessage) map[string]interface{} {
	t.Helper()
	var section map[string]interface{}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&section); err != nil {
		t.Fatal(err)
	}
	return section
}

func TestProductionShapeFixtureIsSanitizedAndRoundTrips(t *testing.T) {
	fixture, raw := loadProductionShapeFixture(t)
	if fixture.FixtureVersion != 1 || fixture.SourceBaseline != "2026-07-17" {
		t.Fatalf("unexpected fixture metadata: %#v", fixture)
	}
	for _, forbidden := range []string{
		"cueballcraft", "thewriterco", "respondent_name", "idempotency_key", "env_data", `"answers"`,
	} {
		if bytes.Contains(bytes.ToLower(raw), []byte(forbidden)) {
			t.Fatalf("fixture contains forbidden production or response data %q", forbidden)
		}
	}

	encoded, err := json.Marshal(fixture)
	if err != nil {
		t.Fatal(err)
	}
	var roundTripped productionShapeFixture
	if err := json.Unmarshal(encoded, &roundTripped); err != nil {
		t.Fatal(err)
	}
	roundTrippedJSON, err := json.Marshal(roundTripped)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(encoded, roundTrippedJSON) {
		t.Fatal("fixture changed during JSON parse/save round trip")
	}
}

func TestProductionShapeFixtureCoversObservedCompatibilityEdges(t *testing.T) {
	fixture, _ := loadProductionShapeFixture(t)
	var objectConfigs, stringConfigs, stringIDs int
	seenTypes := map[string]bool{}
	emptyVisibility := false
	negativeSpacing := false
	inlineRichTextColor := false
	legacyItemWide := false
	multiVideoHero := false
	pageScopedIDs := map[string]int{}

	for _, page := range fixture.Pages {
		emptyVisibility = emptyVisibility || page.Visibility == ""
		for _, rawSection := range page.Content {
			section := decodeFixtureSection(t, rawSection)
			typ, _ := section["section_type"].(string)
			seenTypes[typ] = true
			idKey := string(rawSection)
			if id, ok := section["id"].(string); ok {
				stringIDs++
				idKey = id
			} else if id, ok := section["id"].(json.Number); ok {
				idKey = id.String()
			}
			pageScopedIDs[idKey]++

			config := section["config"]
			var configText string
			switch value := config.(type) {
			case string:
				stringConfigs++
				configText = value
			case map[string]interface{}:
				objectConfigs++
				encoded, _ := json.Marshal(value)
				configText = string(encoded)
			}
			negativeSpacing = negativeSpacing || strings.Contains(configText, `"marginBottom":-48`)
			inlineRichTextColor = inlineRichTextColor || strings.Contains(configText, "color: #334455")
			multiVideoHero = multiVideoHero || strings.Contains(configText, `"videos":[`)

			items, _ := section["items"].([]interface{})
			for _, rawItem := range items {
				item, _ := rawItem.(map[string]interface{})
				if _, ok := item["id"].(string); ok {
					stringIDs++
				}
				encoded, _ := json.Marshal(item["config"])
				legacyItemWide = legacyItemWide || strings.Contains(string(encoded), `\"wide\":true`)
			}
		}
	}

	for _, typ := range []string{
		"features", "hero", "rich_text", "image_gallery", "social_links", "profile_card", "code_editor", "poll", "form", "cta", "feature_grid", "custom_section",
	} {
		if !seenTypes[typ] {
			t.Errorf("missing observed section type %q", typ)
		}
	}
	if objectConfigs == 0 || stringConfigs == 0 || stringIDs == 0 {
		t.Fatalf("missing mixed storage coverage: object=%d string=%d string IDs=%d", objectConfigs, stringConfigs, stringIDs)
	}
	if !emptyVisibility || !negativeSpacing || !inlineRichTextColor || !legacyItemWide || !multiVideoHero {
		t.Fatalf("missing compatibility edge: empty visibility=%t negative spacing=%t inline color=%t item wide=%t multi-video=%t", emptyVisibility, negativeSpacing, inlineRichTextColor, legacyItemWide, multiVideoHero)
	}
	if pageScopedIDs["77"] != 2 {
		t.Fatalf("expected copied pages to reuse page-scoped section ID 77, got %d", pageScopedIDs["77"])
	}

	presetTypes := map[string]bool{}
	for _, preset := range fixture.Presets {
		presetTypes[preset.SectionType] = true
	}
	for _, typ := range []string{"table", "cards", "component"} {
		if !presetTypes[typ] {
			t.Errorf("missing saved preset shape %q", typ)
		}
	}
}

func TestCurrentSaveValidationBoundaryForCompatibilityFixtures(t *testing.T) {
	fixture, _ := loadProductionShapeFixture(t)
	seeded, err := json.Marshal(fixturePage(t, fixture, "seeded_object_config_and_string_ids"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s_registry.ValidateContent(string(seeded), nil); err == nil ||
		(!strings.Contains(err.Error(), "positive numeric id") && !strings.Contains(err.Error(), "cannot unmarshal string")) {
		t.Fatalf("legacy seeded input must stay outside the current save contract until adapted, got %v", err)
	}

	encoded, err := json.Marshal(fixturePage(t, fixture, "encoded_configs_and_legacy_aliases"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s_registry.ValidateContent(string(encoded), nil); err != nil {
		t.Fatalf("current numeric-ID fixture should pass the existing save contract: %v", err)
	}
}

func TestDuplicatePreservesFixtureDocumentExceptInteractiveRuntimeData(t *testing.T) {
	fixture, _ := loadProductionShapeFixture(t)
	content, err := json.Marshal(fixturePage(t, fixture, "encoded_configs_and_legacy_aliases"))
	if err != nil {
		t.Fatal(err)
	}
	repo := &memoryInteractiveRepository{page: models.Page{
		ID: 55, Slug: "source", Title: "Source", Description: "Fixture", Visibility: "public", Content: string(content),
	}}
	duplicate, err := NewService(repo, nil).Duplicate(55, "copy", "")
	if err != nil {
		t.Fatal(err)
	}
	if duplicate.Slug != "copy" || duplicate.Title != "Source (copy)" || duplicate.Visibility != "private" {
		t.Fatalf("unexpected duplicate metadata: %#v", duplicate)
	}
	if duplicate.Content != ClearInteractiveRecords(string(content)) {
		t.Fatal("duplicate did not preserve the fixture document through the interactive-data sanitizer")
	}
}

func TestPageUpdatePatchIsContentFree(t *testing.T) {
	p := &models.Page{ID: 1, Slug: "fixture", Content: `[{"config":"private"}]`}
	raw, err := json.Marshal(pageUpdatePatch(p))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "private") || strings.Contains(string(raw), "content") {
		t.Fatalf("page update propagation leaked page content: %s", raw)
	}
	if !strings.Contains(string(raw), `"partial":true`) {
		t.Fatalf("page update propagation is not an invalidation patch: %s", raw)
	}
}
