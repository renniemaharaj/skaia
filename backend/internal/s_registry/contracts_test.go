package s_registry

import (
	"bytes"
	"encoding/json"
	"testing"
)

type schemaContract struct {
	Schema               string                     `json:"$schema"`
	AdditionalProperties bool                       `json:"additionalProperties"`
	Properties           map[string]json.RawMessage `json:"properties"`
	Required             []string                   `json:"required"`
	Default              json.RawMessage            `json:"default"`
	SectionType          string                     `json:"x-skaia-section-type"`
	ConfigVersion        int                        `json:"x-skaia-config-version"`
}

func decodeContract(t *testing.T, raw json.RawMessage) schemaContract {
	t.Helper()
	var contract schemaContract
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatal(err)
	}
	return contract
}

func TestContractSchemasExposeCanonicalDraft202012Documents(t *testing.T) {
	contracts := ContractSchemas()
	if len(contracts) != 23 {
		t.Fatalf("expected 23 canonical contracts, got %d", len(contracts))
	}
	for name, raw := range contracts {
		contract := decodeContract(t, raw)
		if contract.Schema != "https://json-schema.org/draft/2020-12/schema" {
			t.Errorf("contract %s uses unexpected dialect %q", name, contract.Schema)
		}
		if contract.AdditionalProperties {
			t.Errorf("contract %s must reject unknown top-level fields", name)
		}
		if contract.Properties == nil {
			t.Errorf("contract %s is missing properties", name)
		}
	}
}

func TestSharedShellContractIncludesFirstClassPresentationAndCollapseFields(t *testing.T) {
	contract := decodeContract(t, ContractSchemas()[SharedSectionShellV1])
	required := map[string]bool{}
	for _, field := range contract.Required {
		required[field] = true
	}
	for _, field := range []string{
		"background_color", "text_color", "h1_color", "h2_color", "h3_color",
		"content_scale", "collapsible", "default_collapsed",
	} {
		if _, ok := contract.Properties[field]; !ok || !required[field] {
			t.Errorf("shared shell is missing required field %q", field)
		}
	}
}

func TestPageThemeContractCarriesVersionedRevisionedPaletteTokens(t *testing.T) {
	contract := decodeContract(t, ContractSchemas()[PageThemeV1])
	for _, field := range []string{"version", "revision", "tokens"} {
		if _, ok := contract.Properties[field]; !ok {
			t.Errorf("page theme is missing %q", field)
		}
	}
}

func TestItemAndPresetContractsCarryNormalizedIdentityAndVersionFields(t *testing.T) {
	tests := map[string][]string{
		PageItemV1:      {"id", "section_id", "legacy_key", "config_version", "revision"},
		SectionPresetV1: {"id", "section_type", "shell_version", "config_version", "revision"},
	}
	for name, fields := range tests {
		contract := decodeContract(t, ContractSchemas()[name])
		required := make(map[string]bool, len(contract.Required))
		for _, field := range contract.Required {
			required[field] = true
		}
		for _, field := range fields {
			if _, ok := contract.Properties[field]; !ok || !required[field] {
				t.Errorf("contract %s is missing required field %q", name, field)
			}
		}
	}
}

func TestEveryRegisteredSectionHasOneVersionedCanonicalConfigContract(t *testing.T) {
	contracts := ContractSchemas()
	for _, definition := range List() {
		name := SectionConfigContractName(definition.Type)
		raw, ok := contracts[name]
		if !ok {
			t.Fatalf("missing config contract %q", name)
		}
		contract := decodeContract(t, raw)
		if contract.SectionType != definition.Type || contract.ConfigVersion != 1 {
			t.Errorf("contract %s has type/version %q/%d", name, contract.SectionType, contract.ConfigVersion)
		}
		var defaultConfig map[string]interface{}
		if err := json.Unmarshal(contract.Default, &defaultConfig); err != nil || defaultConfig == nil {
			t.Errorf("contract %s has invalid object default %s: %v", name, contract.Default, err)
		}
		for field := range defaultConfig {
			if _, ok := contract.Properties[field]; !ok {
				t.Errorf("contract %s default contains undeclared field %q", name, field)
			}
		}
		for _, field := range contract.Required {
			if _, ok := defaultConfig[field]; !ok {
				t.Errorf("contract %s default is missing required field %q", name, field)
			}
		}
		if !bytes.Equal(definition.ConfigSchema, raw) {
			t.Errorf("registry definition %s does not expose its canonical contract", definition.Type)
		}
		if !bytes.Equal(definition.DefaultConfig, contract.Default) {
			t.Errorf("registry definition %s default drifted from its contract", definition.Type)
		}
	}
}

func TestSectionConfigContractsDoNotRecombineSharedShellFields(t *testing.T) {
	for _, definition := range List() {
		contract := decodeContract(t, ContractSchemas()[SectionConfigContractName(definition.Type)])
		for _, field := range []string{
			"layout", "margin_top", "padding_top", "background_color", "text_color",
			"content_scale", "collapsible", "default_collapsed",
		} {
			if _, ok := contract.Properties[field]; ok {
				t.Errorf("%s config contract incorrectly owns shared shell field %q", definition.Type, field)
			}
		}
	}
}

func TestCanonicalInteractiveConfigsExcludeSensitiveRuntimeRecords(t *testing.T) {
	for _, sectionType := range []string{"form", "qa", "survey", "poll", "vote"} {
		contract := decodeContract(t, ContractSchemas()[SectionConfigContractName(sectionType)])
		for _, field := range []string{"records", "result_summary"} {
			if _, ok := contract.Properties[field]; ok {
				t.Errorf("%s canonical config includes sensitive runtime field %q", sectionType, field)
			}
		}
	}
}
