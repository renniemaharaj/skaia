package s_registry

import (
	"database/sql"
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
