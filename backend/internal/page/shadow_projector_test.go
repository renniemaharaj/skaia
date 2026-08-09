package page

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestShadowProjectorRoundTripsProductionDefinitionShapes(t *testing.T) {
	fixture, _ := loadProductionShapeFixture(t)
	for _, page := range fixture.Pages {
		page := page
		t.Run(page.Fixture, func(t *testing.T) {
			raw, err := json.Marshal(page.Content)
			if err != nil {
				t.Fatal(err)
			}
			document, err := NormalizeLegacyPageContent(string(raw))
			if err != nil {
				t.Fatal(err)
			}
			projected, err := ProjectNormalizedPageContent(document)
			if err != nil {
				t.Fatal(err)
			}
			roundTripped, err := NormalizeLegacyPageContent(projected)
			if err != nil {
				t.Fatal(err)
			}
			sourceHash, err := shadowDocumentHash(document)
			if err != nil {
				t.Fatal(err)
			}
			projectionHash, err := shadowDocumentHash(roundTripped)
			if err != nil {
				t.Fatal(err)
			}
			if sourceHash != projectionHash && len(document.Quarantine) == 0 {
				t.Fatalf("valid definition projection drifted: source=%s projection=%s\n%s", sourceHash, projectionHash, projected)
			}
		})
	}
}

func TestShadowProjectorSeparatesRuntimeAndRecordsRepairs(t *testing.T) {
	content := `[{
		"id":"section-a","display_order":0,"section_type":"features","heading":"A","subheading":"B",
		"config":{"wide":true,"records":[{"id":"secret","answers":{"free_text":"private"}}],"result_summary":{"total":1}},
		"items":[{"id":"item-a","section_id":"section-a","display_order":0,"heading":"Item","config":{}}],
		"future_section_field":{"preserve":true}
	}]`
	document, err := NormalizeLegacyPageContent(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(document.Sections) != 1 || document.Sections[0].SectionType != "feature_grid" {
		t.Fatalf("legacy type was not normalized: %#v", document)
	}
	if document.Sections[0].LegacyKey.Kind != "string" || document.Sections[0].Items[0].LegacyKey.Kind != "string" {
		t.Fatal("string legacy identities were not preserved")
	}
	if len(document.AliasRepairs) == 0 {
		t.Fatal("legacy type repair was not recorded")
	}
	projected, err := ProjectNormalizedPageContent(document)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"private", "free_text", "result_summary", "records"} {
		if strings.Contains(projected, secret) {
			t.Fatalf("runtime response data reached normalized projection: %s", projected)
		}
	}
	if !strings.Contains(projected, "future_section_field") {
		t.Fatalf("unknown section field was not round-tripped: %s", projected)
	}
}

func TestShadowProjectorQuarantinesUnsafeConfigWithoutEchoingItInTelemetry(t *testing.T) {
	content := `[{"id":1,"section_type":"cta","config":{"bg_color":"red; background:url(https://invalid.example)"}}]`
	document, err := NormalizeLegacyPageContent(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(document.Sections) != 1 || len(document.Sections[0].QuarantinedConfig) == 0 {
		t.Fatalf("unsafe shell field was not quarantined: %#v", document)
	}
	payload, err := json.Marshal(ShadowQuarantine{
		SourceIndex: 0,
		LegacyKey:   &document.Sections[0].LegacyKey,
		ReasonCode:  "section_fields_quarantined",
		SafePayload: map[string]any{
			"config_fields": sortedMapKeys(document.Sections[0].QuarantinedConfig),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "invalid.example") {
		t.Fatalf("quarantine telemetry echoed config values: %s", payload)
	}
}

func TestShadowProjectorIgnoresLegacyTimestamps(t *testing.T) {
	content := `[{
		"id":1,"section_type":"feature_grid","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-02T00:00:00Z",
		"config":{},"items":[{"id":2,"created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-02T00:00:00Z","config":{}}]
	}]`
	document, err := NormalizeLegacyPageContent(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(document.Quarantine) != 0 {
		t.Fatalf("legacy timestamps were quarantined: %#v", document.Quarantine)
	}
	section := document.Sections[0]
	if len(section.QuarantinedSection) != 0 || len(section.Items[0].QuarantinedItem) != 0 {
		t.Fatalf("legacy timestamps reached quarantine: section=%#v item=%#v", section.QuarantinedSection, section.Items[0].QuarantinedItem)
	}
	projected, err := ProjectNormalizedPageContent(document)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(projected, "created_at") || strings.Contains(projected, "updated_at") {
		t.Fatalf("legacy timestamps reached normalized projection: %s", projected)
	}
}

func TestShadowProjectorOmitsInertLegacyConfigFields(t *testing.T) {
	content := `[
		{"id":1,"section_type":"form","config":{"moderation":true}},
		{"id":2,"section_type":"feature_grid","config":{"links":[{"url":"https://example.invalid"}]}},
		{"id":3,"section_type":"qa","config":{"moderation":false}},
		{"id":4,"section_type":"social_links","config":{"links":[{"icon":"Globe","url":"https://example.invalid","name":"Legacy label"}]}}
	]`
	document, err := NormalizeLegacyPageContent(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(document.Quarantine) != 0 {
		t.Fatalf("inert legacy config was quarantined: %#v", document.Quarantine)
	}
	if len(document.Sections[0].QuarantinedConfig) != 0 || len(document.Sections[1].QuarantinedConfig) != 0 {
		t.Fatalf("inert legacy config reached quarantine: %#v", document.Sections)
	}
	if _, exists := document.Sections[0].Config["moderation"]; exists {
		t.Fatal("form moderation reached normalized config")
	}
	if _, exists := document.Sections[1].Config["links"]; exists {
		t.Fatal("feature-grid links reached normalized config")
	}
	if moderation, ok := document.Sections[2].Config["moderation"].(bool); !ok || moderation {
		t.Fatalf("Q&A moderation was not preserved: %#v", document.Sections[2].Config)
	}
	if links, ok := document.Sections[3].Config["links"].([]any); !ok || len(links) != 1 {
		t.Fatalf("social links were not preserved: %#v", document.Sections[3].Config)
	}
	if _, exists := document.Sections[3].Config["links"].([]any)[0].(map[string]any)["name"]; exists {
		t.Fatalf("legacy social-link name reached normalized config: %#v", document.Sections[3].Config)
	}
	if len(document.DefaultRepairs) != 3 {
		t.Fatalf("omissions were not audited: %#v", document.DefaultRepairs)
	}
}
