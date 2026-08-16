package s_registry

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Definition is compact page-builder metadata. It describes the renderer
// registry without pretending that every section shares one normalized schema.
type Definition struct {
	Type          string          `json:"type"`
	Label         string          `json:"label"`
	Group         string          `json:"group"`
	Description   string          `json:"description"`
	DefaultConfig json.RawMessage `json:"default_config"`
}

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
	interactiveDef("form", "Form", "Schema-designed form with section-local responses."),
	interactiveDef("qa", "Questions & Answers", "Moderated questions and answers."),
	interactiveDef("survey", "Survey", "Multi-question survey with summarized results."),
	interactiveDef("poll", "Poll", "Audience poll with participation-aware results."),
	interactiveDef("vote", "Voting", "Confirmed ballot with controlled result visibility."),
}

func def(typ, label, group, description string) Definition {
	return Definition{Type: typ, Label: label, Group: group, Description: description, DefaultConfig: json.RawMessage(`{}`)}
}

func interactiveDef(typ, label, description string) Definition {
	return Definition{Type: typ, Label: label, Group: "interactive", Description: description,
		DefaultConfig: json.RawMessage(`{"status":"open","result_visibility":"never","response_limit":0,"fields":[],"records":[]}`)}
}

var definitionsByType = func() map[string]Definition {
	out := make(map[string]Definition, len(definitions))
	for _, definition := range definitions {
		out[definition.Type] = definition
	}
	return out
}()

// CanonicalType retains the historical features spelling without rewriting
// stored documents merely because the renderer now calls it feature_grid.
func CanonicalType(typ string) string {
	if typ == "features" {
		return "feature_grid"
	}
	return typ
}

func List() []Definition {
	out := make([]Definition, len(definitions))
	for i, definition := range definitions {
		out[i] = cloneDefinition(definition)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Type < out[j].Type })
	return out
}

func Get(typ string) (Definition, bool) {
	definition, ok := definitionsByType[CanonicalType(typ)]
	return cloneDefinition(definition), ok
}

func cloneDefinition(definition Definition) Definition {
	definition.DefaultConfig = append(json.RawMessage(nil), definition.DefaultConfig...)
	return definition
}

func IsSupported(typ string) bool { _, ok := definitionsByType[CanonicalType(typ)]; return ok }

type contentSection struct {
	ID          json.RawMessage `json:"id"`
	SectionType string          `json:"section_type"`
	Config      json.RawMessage `json:"config"`
}

func documentID(raw json.RawMessage) (string, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return "", err
	}
	switch typed := value.(type) {
	case string:
		if strings.TrimSpace(typed) == "" {
			return "", fmt.Errorf("string id is empty")
		}
		return "s:" + typed, nil
	case json.Number:
		id, err := strconv.ParseInt(string(typed), 10, 64)
		if err != nil || id <= 0 {
			return "", fmt.Errorf("numeric id must be a positive integer")
		}
		return "n:" + strconv.FormatInt(id, 10), nil
	default:
		return "", fmt.Errorf("id must be a positive integer or non-empty string")
	}
}

// ValidateContent guards the real pages.content envelope while preserving its
// string/object config encoding and numeric/string identity compatibility.
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
	seen := make(map[string]struct{}, len(sections))
	for index, section := range sections {
		key, err := documentID(section.ID)
		if err != nil {
			return fmt.Errorf("section %d has invalid id: %w", index, err)
		}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("section %d has duplicate id", index)
		}
		seen[key] = struct{}{}
		if !IsSupported(section.SectionType) {
			return fmt.Errorf("section %d has unsupported section_type %q", index, section.SectionType)
		}
		config, err := decodeConfig(section.Config)
		if err != nil {
			return fmt.Errorf("section %d config is invalid: %w", index, err)
		}
		typ := CanonicalType(section.SectionType)
		if resolver != nil {
			if err := validateIntegrationRefs(index, typ, config, resolver); err != nil {
				return err
			}
			if typ == "derived_section" || typ == "custom_section" {
				if err := ValidateComponentConfig(config); err != nil {
					return fmt.Errorf("section %d component config is invalid: %w", index, err)
				}
			}
		}
		if IsInteractive(typ) {
			if err := ValidateInteractiveConfig(typ, config); err != nil {
				return fmt.Errorf("section %d interactive config is invalid: %w", index, err)
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
	var config map[string]interface{}
	if err := json.Unmarshal(raw, &config); err != nil {
		return nil, err
	}
	if config == nil {
		config = map[string]interface{}{}
	}
	return config, nil
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
	switch typed := value.(type) {
	case float64:
		if typed > 0 && typed == float64(int64(typed)) {
			return int64(typed), true
		}
	case int64:
		return typed, typed > 0
	case int:
		return int64(typed), typed > 0
	}
	return 0, false
}
