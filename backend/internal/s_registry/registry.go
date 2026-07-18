package s_registry

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Definition describes one page section type supported by the backend.
type Definition struct {
	Type                string          `json:"type"`
	Label               string          `json:"label"`
	Group               string          `json:"group"`
	Description         string          `json:"description"`
	ConfigVersion       int             `json:"config_version"`
	DefaultConfig       json.RawMessage `json:"default_config"`
	Capabilities        []string        `json:"capabilities"`
	ConfigSchema        json.RawMessage `json:"config_schema"`
	ItemSchema          json.RawMessage `json:"item_schema"`
	SupportedMigrations []int           `json:"supported_migrations"`
}

// Resolver validates saved integration references used by page section config.
type Resolver interface {
	DataSourceExists(id int64) (bool, error)
	CustomSectionExists(id int64) (bool, error)
}

var definitions = []Definition{
	def("hero", "Hero Banner", "featured", "Large visual introduction section."),
	def("card_group", "Card Group", "content", "Structured card grid."),
	def("stat_cards", "Stat Cards", "content", "Metric cards with icons and text."),
	def("social_links", "Social Links", "content", "Social profile links."),
	def("image_gallery", "Image Gallery", "content", "Gallery of uploaded or linked images."),
	def("feature_grid", "Feature Grid", "content", "Feature tiles with icon, text, and links."),
	def("cta", "Call to Action", "featured", "Focused call-to-action panel."),
	def("event_highlights", "Event Highlights", "featured", "Event cards and schedule highlights."),
	def("profile_card", "Profile Card", "featured", "Profile summary block."),
	def("rich_text", "Rich Text", "rich", "Formatted text content."),
	def("code_editor", "Code Editor", "rich", "Code snippet display and editing."),
	def("data_sources", "Data Sources", "rich", "Datasource management block."),
	def("derived_section", "Derived Section", "rich", "Datasource-backed rendered section."),
	def("custom_section", "Custom Section", "rich", "Reusable custom datasource-backed section."),
	def("form", "Form", "interactive", "Schema-designed form with section-local responses."),
	def("qa", "Questions & Answers", "interactive", "Moderated questions and answers."),
	def("survey", "Survey", "interactive", "Multi-question survey with summarized results."),
	def("poll", "Poll", "interactive", "Audience poll with participation-aware results."),
	def("vote", "Voting", "interactive", "Confirmed ballot with controlled result visibility."),
}

var definitionsByType = func() map[string]Definition {
	out := make(map[string]Definition, len(definitions))
	for _, d := range definitions {
		out[d.Type] = d
	}
	return out
}()

func def(typ, label, group, description string) Definition {
	schema := mustContractSchema(SectionConfigContractName(typ))
	var contract struct {
		Default json.RawMessage `json:"default"`
	}
	if err := json.Unmarshal(schema, &contract); err != nil {
		panic(fmt.Errorf("decode %s config contract: %w", typ, err))
	}
	if len(contract.Default) == 0 {
		panic(fmt.Errorf("%s config contract is missing a default", typ))
	}

	var itemSchema json.RawMessage
	if sectionUsesItems(typ) {
		itemSchema = mustContractSchema(PageItemV1)
	}
	return Definition{
		Type:                typ,
		Label:               label,
		Group:               group,
		Description:         description,
		ConfigVersion:       1,
		DefaultConfig:       append(json.RawMessage(nil), contract.Default...),
		Capabilities:        sectionCapabilities(typ),
		ConfigSchema:        schema,
		ItemSchema:          itemSchema,
		SupportedMigrations: []int{},
	}
}

func sectionUsesItems(typ string) bool {
	switch typ {
	case "card_group", "stat_cards", "image_gallery", "feature_grid", "event_highlights":
		return true
	default:
		return false
	}
}

func sectionCapabilities(typ string) []string {
	capabilities := []string{"shared_shell"}
	if sectionUsesItems(typ) {
		capabilities = append(capabilities, "items")
	}
	switch typ {
	case "hero":
		capabilities = append(capabilities, "media")
	case "social_links":
		capabilities = append(capabilities, "config_list")
	case "rich_text":
		capabilities = append(capabilities, "rich_text")
	case "code_editor":
		capabilities = append(capabilities, "code_preview")
	case "data_sources":
		capabilities = append(capabilities, "datasource_management")
	case "derived_section":
		capabilities = append(capabilities, "datasource", "component_registry")
	case "custom_section":
		capabilities = append(capabilities, "preset", "datasource", "component_registry")
	case "form", "qa", "survey", "poll", "vote":
		capabilities = append(capabilities, "interactive", "sensitive_responses")
	}
	return capabilities
}

// List returns a stable copy of all section definitions.
func List() []Definition {
	out := make([]Definition, len(definitions))
	for i, definition := range definitions {
		out[i] = cloneDefinition(definition)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Type < out[j].Type })
	return out
}

// SectionTypes returns the canonical display order used by generated clients.
func SectionTypes() []string {
	types := make([]string, len(definitions))
	for i, definition := range definitions {
		types[i] = definition.Type
	}
	return types
}

// Get returns one section definition by type.
func Get(typ string) (Definition, bool) {
	d, ok := definitionsByType[typ]
	return cloneDefinition(d), ok
}

func cloneDefinition(definition Definition) Definition {
	definition.DefaultConfig = append(json.RawMessage(nil), definition.DefaultConfig...)
	definition.Capabilities = append([]string(nil), definition.Capabilities...)
	definition.ConfigSchema = append(json.RawMessage(nil), definition.ConfigSchema...)
	definition.ItemSchema = append(json.RawMessage(nil), definition.ItemSchema...)
	definition.SupportedMigrations = append([]int{}, definition.SupportedMigrations...)
	return definition
}

// IsSupported reports whether typ is a registered section type.
func IsSupported(typ string) bool {
	_, ok := definitionsByType[typ]
	return ok
}

type contentSection struct {
	ID          int64           `json:"id"`
	SectionType string          `json:"section_type"`
	Config      json.RawMessage `json:"config"`
}

// ValidateContent validates a page Content JSON array against the backend
// registry and, when supplied, stored datasource/custom-section references.
func ValidateContent(content string, resolver Resolver) error {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return nil
	}
	if !strings.HasPrefix(trimmed, "[") {
		return fmt.Errorf("content must be a JSON array of sections")
	}

	var sections []contentSection
	if err := json.Unmarshal([]byte(trimmed), &sections); err != nil {
		return fmt.Errorf("content must be a JSON array of sections: %w", err)
	}

	seenSectionIDs := make(map[int64]struct{}, len(sections))
	for i, section := range sections {
		if section.ID <= 0 {
			return fmt.Errorf("section %d must have a positive numeric id", i)
		}
		if _, exists := seenSectionIDs[section.ID]; exists {
			return fmt.Errorf("section %d has duplicate id %d", i, section.ID)
		}
		seenSectionIDs[section.ID] = struct{}{}
		if section.SectionType == "" {
			return fmt.Errorf("section %d is missing section_type", i)
		}
		if !IsSupported(section.SectionType) {
			return fmt.Errorf("section %d has unsupported section_type %q", i, section.SectionType)
		}
		cfg, err := decodeConfig(section.Config)
		if err != nil {
			return fmt.Errorf("section %d config is invalid: %w", i, err)
		}
		if resolver == nil {
			if IsInteractive(section.SectionType) {
				if err := ValidateInteractiveConfig(section.SectionType, cfg); err != nil {
					return fmt.Errorf("section %d interactive config is invalid: %w", i, err)
				}
			}
			continue
		}
		if err := validateIntegrationRefs(i, section.SectionType, cfg, resolver); err != nil {
			return err
		}
		// Validate component registry config for section types that support it.
		if section.SectionType == "derived_section" || section.SectionType == "custom_section" {
			if err := ValidateComponentConfig(cfg); err != nil {
				return fmt.Errorf("section %d component config is invalid: %w", i, err)
			}
		}
		if IsInteractive(section.SectionType) {
			if err := ValidateInteractiveConfig(section.SectionType, cfg); err != nil {
				return fmt.Errorf("section %d interactive config is invalid: %w", i, err)
			}
		}
	}
	return nil
}

func decodeConfig(raw json.RawMessage) (map[string]interface{}, error) {
	if len(raw) == 0 || string(raw) == "null" || string(raw) == `""` {
		return map[string]interface{}{}, nil
	}
	if raw[0] == '"' {
		var encoded string
		if err := json.Unmarshal(raw, &encoded); err != nil {
			return nil, err
		}
		if strings.TrimSpace(encoded) == "" {
			return map[string]interface{}{}, nil
		}
		raw = json.RawMessage(encoded)
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}
	if cfg == nil {
		cfg = map[string]interface{}{}
	}
	return cfg, nil
}

func validateIntegrationRefs(index int, typ string, cfg map[string]interface{}, resolver Resolver) error {
	switch typ {
	case "derived_section":
		id, ok := positiveInt64(cfg["datasource_id"])
		if !ok {
			return nil
		}
		exists, err := resolver.DataSourceExists(id)
		if err != nil {
			return fmt.Errorf("section %d datasource_id %d could not be validated: %w", index, id, err)
		}
		if !exists {
			return fmt.Errorf("section %d references unknown datasource_id %d", index, id)
		}
	case "custom_section":
		id, ok := positiveInt64(cfg["custom_section_id"])
		if !ok {
			return nil
		}
		exists, err := resolver.CustomSectionExists(id)
		if err != nil {
			return fmt.Errorf("section %d custom_section_id %d could not be validated: %w", index, id, err)
		}
		if !exists {
			return fmt.Errorf("section %d references unknown custom_section_id %d", index, id)
		}
	}
	return nil
}

func positiveInt64(value interface{}) (int64, bool) {
	switch v := value.(type) {
	case float64:
		if v > 0 && v == float64(int64(v)) {
			return int64(v), true
		}
	case int64:
		return v, v > 0
	case int:
		return int64(v), v > 0
	}
	return 0, false
}
