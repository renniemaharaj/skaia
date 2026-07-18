package s_registry

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
)

type fakeResolver struct {
	dataSources    map[int64]bool
	customSections map[int64]bool
}

func (r fakeResolver) DataSourceExists(id int64) (bool, error) {
	if r.dataSources == nil {
		return false, sql.ErrNoRows
	}
	return r.dataSources[id], nil
}

func (r fakeResolver) CustomSectionExists(id int64) (bool, error) {
	if r.customSections == nil {
		return false, sql.ErrNoRows
	}
	return r.customSections[id], nil
}

func TestRegistryDefinitionsIncludeIntegrationTypes(t *testing.T) {
	for _, typ := range []string{"derived_section", "custom_section"} {
		def, ok := Get(typ)
		if !ok {
			t.Fatalf("expected %s definition", typ)
		}
		if len(def.ConfigSchema) == 0 || string(def.ConfigSchema) == "{}" {
			t.Fatalf("expected %s to expose a config schema", typ)
		}
	}
}

func TestRegistryDefinitionsIncludeInteractivePageSections(t *testing.T) {
	for _, typ := range []string{"form", "qa", "survey", "poll", "vote"} {
		if _, ok := Get(typ); !ok {
			t.Fatalf("expected %s definition", typ)
		}
	}
}

func TestRegistryContainsExactlyTheNineteenPageSectionTypes(t *testing.T) {
	expected := map[string]bool{
		"hero": true, "card_group": true, "stat_cards": true, "social_links": true,
		"image_gallery": true, "feature_grid": true, "cta": true, "event_highlights": true,
		"profile_card": true, "rich_text": true, "code_editor": true, "data_sources": true,
		"derived_section": true, "custom_section": true, "form": true, "qa": true,
		"survey": true, "poll": true, "vote": true,
	}
	definitions := List()
	if len(definitions) != len(expected) {
		t.Fatalf("expected %d definitions, got %d", len(expected), len(definitions))
	}
	for _, definition := range definitions {
		if !expected[definition.Type] {
			t.Errorf("unexpected registry section type %q", definition.Type)
		}
		delete(expected, definition.Type)
	}
	if len(expected) != 0 {
		t.Fatalf("registry is missing section types: %#v", expected)
	}
}

func TestRegistryDefinitionsExposeVersionDefaultsCapabilitiesAndItemContracts(t *testing.T) {
	itemTypes := map[string]bool{
		"card_group": true, "stat_cards": true, "image_gallery": true,
		"feature_grid": true, "event_highlights": true,
	}
	itemContract := ContractSchemas()[PageItemV1]
	for _, definition := range List() {
		if definition.ConfigVersion != 1 {
			t.Errorf("%s has config version %d", definition.Type, definition.ConfigVersion)
		}
		var defaultConfig map[string]interface{}
		if err := json.Unmarshal(definition.DefaultConfig, &defaultConfig); err != nil {
			t.Errorf("%s has invalid default config: %v", definition.Type, err)
		}
		if len(definition.Capabilities) == 0 || definition.Capabilities[0] != "shared_shell" {
			t.Errorf("%s is missing shared-shell capability", definition.Type)
		}
		if definition.SupportedMigrations == nil {
			t.Errorf("%s must expose an empty migration list rather than null", definition.Type)
		}
		if itemTypes[definition.Type] != bytes.Equal(definition.ItemSchema, itemContract) {
			t.Errorf("%s item contract presence does not match item capability", definition.Type)
		}
	}
}

func TestRegistryDefinitionsAreReturnedAsIndependentCopies(t *testing.T) {
	first, _ := Get("hero")
	first.Capabilities[0] = "mutated"
	first.ConfigSchema[0] = 'x'

	second, _ := Get("hero")
	if second.Capabilities[0] != "shared_shell" || second.ConfigSchema[0] != '{' {
		t.Fatal("registry definition mutation leaked into canonical metadata")
	}
}

func TestValidateContentRejectsInvalidInteractiveFields(t *testing.T) {
	err := ValidateContent(`[{"id":1,"section_type":"form","config":"{\"status\":\"open\",\"result_visibility\":\"never\",\"response_limit\":0,\"fields\":[{\"key\":\"x\",\"type\":\"executable\"}]}"}]`, nil)
	if err == nil || !strings.Contains(err.Error(), "unsupported type") {
		t.Fatalf("expected interactive field validation error, got %v", err)
	}
}

func TestValidateContentRejectsUnknownSectionType(t *testing.T) {
	err := ValidateContent(`[{"id":1,"section_type":"mystery","config":"{}"}]`, nil)
	if err == nil || !strings.Contains(err.Error(), "unsupported section_type") {
		t.Fatalf("expected unsupported section_type error, got %v", err)
	}
}

func TestValidateContentRejectsNonArrayContent(t *testing.T) {
	err := ValidateContent(`{"section_type":"hero","config":"{}"}`, nil)
	if err == nil || !strings.Contains(err.Error(), "JSON array") {
		t.Fatalf("expected array content error, got %v", err)
	}
}

func TestValidateContentRejectsInvalidSectionIdentity(t *testing.T) {
	for _, content := range []string{
		`[{"id":0,"section_type":"hero","config":"{}"}]`,
		`[{"id":1,"section_type":"hero","config":"{}"},{"id":1,"section_type":"rich_text","config":"{}"}]`,
	} {
		if err := ValidateContent(content, nil); err == nil {
			t.Fatalf("expected invalid section identity to be rejected: %s", content)
		}
	}
}

func TestValidateContentRejectsInvalidDatasourceReference(t *testing.T) {
	content := `[{"id":1,"section_type":"derived_section","config":"{\"datasource_id\":42}"}]`
	err := ValidateContent(content, fakeResolver{dataSources: map[int64]bool{1: true}})
	if err == nil || !strings.Contains(err.Error(), "unknown datasource_id 42") {
		t.Fatalf("expected unknown datasource error, got %v", err)
	}
}

func TestValidateContentAcceptsKnownIntegrationReferences(t *testing.T) {
	content := `[
		{"id":1,"section_type":"derived_section","config":"{\"datasource_id\":7}"},
		{"id":2,"section_type":"custom_section","config":{"custom_section_id":9}}
	]`
	err := ValidateContent(content, fakeResolver{
		dataSources:    map[int64]bool{7: true},
		customSections: map[int64]bool{9: true},
	})
	if err != nil {
		t.Fatalf("expected valid content, got %v", err)
	}
}
