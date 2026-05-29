package s_registry

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Definition describes one page section type supported by the backend.
type Definition struct {
	Type         string          `json:"type"`
	Label        string          `json:"label"`
	Group        string          `json:"group"`
	Description  string          `json:"description"`
	ConfigSchema json.RawMessage `json:"config_schema"`
}

// Resolver validates saved integration references used by page section config.
type Resolver interface {
	DataSourceExists(id int64) (bool, error)
	CustomSectionExists(id int64) (bool, error)
}

var definitions = []Definition{
	def("hero", "Hero Banner", "featured", "Large visual introduction section.", `{}`),
	def("card_group", "Card Group", "content", "Structured card grid.", `{}`),
	def("stat_cards", "Stat Cards", "content", "Metric cards with icons and text.", `{}`),
	def("social_links", "Social Links", "content", "Social profile links.", `{}`),
	def("image_gallery", "Image Gallery", "content", "Gallery of uploaded or linked images.", `{}`),
	def("feature_grid", "Feature Grid", "content", "Feature tiles with icon, text, and links.", `{}`),
	def("cta", "Call to Action", "featured", "Focused call-to-action panel.", `{}`),
	def("event_highlights", "Event Highlights", "featured", "Event cards and schedule highlights.", `{}`),
	def("profile_card", "Profile Card", "featured", "Profile summary block.", `{}`),
	def("rich_text", "Rich Text", "rich", "Formatted text content.", `{}`),
	def("code_editor", "Code Editor", "rich", "Code snippet display and editing.", `{}`),
	def("data_sources", "Data Sources", "rich", "Datasource management block.", `{}`),
	def("derived_section", "Derived Section", "rich", "Datasource-backed rendered section.", `{"type":"object","properties":{"datasource_id":{"type":"integer","minimum":1},"column_map":{"type":"object"},"row_key_column":{"type":"string"},"row_overrides":{"type":"object"},"card_template":{"type":"object"}}}`),
	def("custom_section", "Custom Section", "rich", "Reusable custom datasource-backed section.", `{"type":"object","properties":{"custom_section_id":{"type":"integer","minimum":1},"column_map":{"type":"object"},"row_key_column":{"type":"string"},"row_overrides":{"type":"object"},"card_template":{"type":"object"}}}`),
}

var definitionsByType = func() map[string]Definition {
	out := make(map[string]Definition, len(definitions))
	for _, d := range definitions {
		out[d.Type] = d
	}
	return out
}()

func def(typ, label, group, description, schema string) Definition {
	return Definition{
		Type:         typ,
		Label:        label,
		Group:        group,
		Description:  description,
		ConfigSchema: json.RawMessage(schema),
	}
}

// List returns a stable copy of all section definitions.
func List() []Definition {
	out := append([]Definition(nil), definitions...)
	sort.Slice(out, func(i, j int) bool { return out[i].Type < out[j].Type })
	return out
}

// Get returns one section definition by type.
func Get(typ string) (Definition, bool) {
	d, ok := definitionsByType[typ]
	return d, ok
}

// IsSupported reports whether typ is a registered section type.
func IsSupported(typ string) bool {
	_, ok := definitionsByType[typ]
	return ok
}

type contentSection struct {
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

	for i, section := range sections {
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
			continue
		}
		if err := validateIntegrationRefs(i, section.SectionType, cfg, resolver); err != nil {
			return err
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
