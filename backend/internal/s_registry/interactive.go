package s_registry

import (
	"fmt"
	"strings"
)

const interactiveConfigSchema = `{"type":"object","properties":{"fields":{"type":"array","maxItems":50},"records":{"type":"array","maxItems":1000},"result_visibility":{"enum":["never","after_participation","always"]},"status":{"enum":["open","closed"]}}}`

var interactiveTypes = map[string]bool{
	"form": true, "qa": true, "survey": true, "poll": true, "vote": true,
}

var interactiveFieldTypes = map[string]bool{
	"text": true, "textarea": true, "email": true, "phone": true, "url": true,
	"number": true, "date": true, "time": true, "select": true,
	"multi_select": true, "radio": true, "checkbox": true, "consent": true,
	"rating": true, "scale": true, "nps": true,
}

// IsInteractive reports whether a section is one of the interactive PageSection
// variants. They remain ordinary page sections stored in pages.content.
func IsInteractive(typ string) bool { return interactiveTypes[typ] }

// ValidateInteractiveConfig bounds the data embedded in a PageSection config.
func ValidateInteractiveConfig(typ string, cfg map[string]interface{}) error {
	if !IsInteractive(typ) {
		return nil
	}
	if status, _ := cfg["status"].(string); status != "" && status != "open" && status != "closed" {
		return fmt.Errorf("status must be open or closed")
	}
	visibility, _ := cfg["result_visibility"].(string)
	if visibility != "" && visibility != "never" && visibility != "after_participation" && visibility != "always" {
		return fmt.Errorf("unsupported result_visibility")
	}
	fields, _ := cfg["fields"].([]interface{})
	if len(fields) > 50 {
		return fmt.Errorf("fields exceeds 50")
	}
	seen := map[string]bool{}
	for i, raw := range fields {
		field, ok := raw.(map[string]interface{})
		if !ok {
			return fmt.Errorf("field %d must be an object", i)
		}
		key, _ := field["key"].(string)
		fieldType, _ := field["type"].(string)
		if strings.TrimSpace(key) == "" || len(key) > 80 || seen[key] {
			return fmt.Errorf("field %d has an invalid or duplicate key", i)
		}
		seen[key] = true
		if !interactiveFieldTypes[fieldType] {
			return fmt.Errorf("field %q has unsupported type %q", key, fieldType)
		}
		options, _ := field["options"].([]interface{})
		if len(options) > 100 {
			return fmt.Errorf("field %q exceeds 100 options", key)
		}
	}
	records, _ := cfg["records"].([]interface{})
	if len(records) > 1000 {
		return fmt.Errorf("records exceeds 1000")
	}
	return nil
}
