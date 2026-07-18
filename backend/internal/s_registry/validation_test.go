package s_registry

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestAllCanonicalContractsResolveAndAcceptTheirSectionDefaults(t *testing.T) {
	set := resolvedContractSchemas()
	if set.err != nil {
		t.Fatal(set.err)
	}
	if len(set.contracts) != len(ContractSchemas()) {
		t.Fatalf("compiled %d of %d contracts", len(set.contracts), len(ContractSchemas()))
	}
	for _, definition := range List() {
		var config map[string]any
		if err := json.Unmarshal(definition.DefaultConfig, &config); err != nil {
			t.Fatal(err)
		}
		if err := ValidateNormalizedSectionConfig(definition.Type, config); err != nil {
			t.Errorf("%s default failed normalized validation: %v", definition.Type, err)
		}
	}
}

func TestNormalizedValidationRejectsUnknownFieldsAndBounds(t *testing.T) {
	for _, config := range []map[string]any{
		{"unknown": true},
		{"tint_opacity": 2.0},
	} {
		if err := ValidateNormalizedSectionConfig("hero", config); !errors.Is(err, ErrContractValueInvalid) {
			t.Fatalf("expected normalized hero config rejection, got %v", err)
		}
	}
}

func TestNormalizedInteractiveValidationRejectsRuntimeRecords(t *testing.T) {
	config := map[string]any{
		"status":            "open",
		"submit_label":      "Send",
		"success_text":      "Done",
		"result_visibility": "never",
		"response_limit":    0,
		"fields": []any{
			map[string]any{"key": "message", "type": "textarea", "label": "Message"},
		},
		"records": []any{map[string]any{"answer": "private"}},
	}
	if err := ValidateNormalizedSectionConfig("form", config); !errors.Is(err, ErrContractValueInvalid) {
		t.Fatalf("expected runtime records to be rejected, got %v", err)
	}
}

func TestLegacyValidationRemainsSeparateFromNormalizedValidation(t *testing.T) {
	legacy := `[{"id":1,"section_type":"hero","config":{"marginTop":-8,"video_url":"/legacy.mp4"}}]`
	if err := ValidateContent(legacy, nil); err != nil {
		t.Fatalf("legacy compatibility validation unexpectedly failed: %v", err)
	}
	if err := ValidateNormalizedSectionConfig("hero", map[string]any{
		"marginTop": -8.0, "video_url": "/legacy.mp4",
	}); !errors.Is(err, ErrContractValueInvalid) {
		t.Fatalf("expected unmigrated legacy config to fail normalized validation, got %v", err)
	}
}

func TestContractValidationEnforcesSafeCSSColors(t *testing.T) {
	valid := map[string]any{
		"version":  1.0,
		"revision": 1.0,
		"tokens": []any{
			map[string]any{"key": "brand", "label": "Brand", "value": "rgba(12, 34, 56, 0.8)", "display_order": 0.0, "revision": 1.0},
		},
	}
	if err := ValidateContractValue(PageThemeV1, valid); err != nil {
		t.Fatalf("expected safe palette color, got %v", err)
	}
	valid["tokens"].([]any)[0].(map[string]any)["value"] = "red; background:url(javascript:alert(1))"
	if err := ValidateContractValue(PageThemeV1, valid); !errors.Is(err, ErrContractValueInvalid) {
		t.Fatalf("expected unsafe palette color rejection, got %v", err)
	}
}

func TestContractValidationErrorsDoNotEchoUserValues(t *testing.T) {
	secret := "private-response-value"
	err := ValidateNormalizedSectionConfig("rich_text", map[string]any{"content": 42.0, "secret": secret})
	if !errors.Is(err, ErrContractValueInvalid) {
		t.Fatalf("expected validation failure, got %v", err)
	}
	if strings.Contains(err.Error(), secret) {
		t.Fatal("contract validation error exposed user content")
	}
}

func TestContractValidationRejectsUnknownContracts(t *testing.T) {
	if err := ValidateContractValue("missing", map[string]any{}); !errors.Is(err, ErrUnknownContract) {
		t.Fatalf("expected unknown contract error, got %v", err)
	}
}
