package s_registry

import (
	"embed"
	"encoding/json"
	"fmt"
)

const (
	SharedSectionShellV1 = "shared_section_shell_v1"
	PageThemeV1          = "page_theme_v1"
	PageItemV1           = "page_item_v1"
	SectionPresetV1      = "section_preset_v1"
)

// contractSchemaFiles is the canonical schema source embedded into the backend
// registry so the public registry API and drift tests read the checked-in files.
//
//go:generate go run ../../cmd/section-contract-gen -output ../../../frontend/src/components/page/sectionContracts.generated.ts -go-output section_configs_generated.go
//go:embed schemas/*.json
var contractSchemaFiles embed.FS

var contractSchemaPaths = map[string]string{
	SharedSectionShellV1: "schemas/shared-section-shell.v1.schema.json",
	PageThemeV1:          "schemas/page-theme.v1.schema.json",
	PageItemV1:           "schemas/page-item.v1.schema.json",
	SectionPresetV1:      "schemas/section-preset.v1.schema.json",
}

const sectionConfigBundlePath = "schemas/section-configs.v1.json"

var embeddedContractSchemas = loadContractSchemas()

// SectionConfigContractName returns the stable registry key for a section type's
// current config contract.
func SectionConfigContractName(sectionType string) string {
	return "section_config_" + sectionType + "_v1"
}

// ContractSchemas returns independent raw JSON copies keyed by stable contract name.
func ContractSchemas() map[string]json.RawMessage {
	result := make(map[string]json.RawMessage, len(embeddedContractSchemas))
	for name, raw := range embeddedContractSchemas {
		result[name] = append(json.RawMessage(nil), raw...)
	}
	return result
}

func loadContractSchemas() map[string]json.RawMessage {
	result := make(map[string]json.RawMessage, len(contractSchemaPaths)+19)
	for name, path := range contractSchemaPaths {
		raw, err := contractSchemaFiles.ReadFile(path)
		if err != nil {
			continue
		}
		result[name] = append(json.RawMessage(nil), raw...)
	}

	bundle, err := contractSchemaFiles.ReadFile(sectionConfigBundlePath)
	if err != nil {
		return result
	}
	var sectionSchemas map[string]json.RawMessage
	if err := json.Unmarshal(bundle, &sectionSchemas); err != nil {
		return result
	}
	for sectionType, raw := range sectionSchemas {
		result[SectionConfigContractName(sectionType)] = append(json.RawMessage(nil), raw...)
	}
	return result
}

func contractSchema(name string) (json.RawMessage, error) {
	raw, ok := embeddedContractSchemas[name]
	if !ok {
		return nil, fmt.Errorf("missing embedded contract %q", name)
	}
	return append(json.RawMessage(nil), raw...), nil
}

func mustContractSchema(name string) json.RawMessage {
	raw, err := contractSchema(name)
	if err != nil {
		panic(err)
	}
	return raw
}
