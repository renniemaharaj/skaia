package s_registry

import (
	"fmt"
	"math"
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
	status, statusOK := cfg["status"].(string)
	if !statusOK || (status != "open" && status != "closed") {
		return fmt.Errorf("status must be open or closed")
	}
	visibility, visibilityOK := cfg["result_visibility"].(string)
	if !visibilityOK || (visibility != "never" && visibility != "after_participation" && visibility != "always") {
		return fmt.Errorf("unsupported result_visibility")
	}
	limit, limitOK := cfg["response_limit"].(float64)
	if !limitOK || math.IsNaN(limit) || math.IsInf(limit, 0) || limit < 0 || limit > 1000 || limit != math.Trunc(limit) {
		return fmt.Errorf("response_limit must be a whole number from 0 to 1000")
	}
	if moderation, exists := cfg["moderation"]; exists {
		if _, ok := moderation.(bool); !ok {
			return fmt.Errorf("moderation must be boolean")
		}
	}
	fields, fieldsOK := cfg["fields"].([]interface{})
	if !fieldsOK || len(fields) == 0 {
		return fmt.Errorf("fields must contain at least one field")
	}
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
		if required, exists := field["required"]; exists {
			if _, ok := required.(bool); !ok {
				return fmt.Errorf("field %q required must be boolean", key)
			}
		}
		options, optionsOK := field["options"].([]interface{})
		if _, exists := field["options"]; exists && !optionsOK {
			return fmt.Errorf("field %q options must be an array", key)
		}
		if len(options) > 100 {
			return fmt.Errorf("field %q exceeds 100 options", key)
		}
		choice := fieldType == "select" || fieldType == "multi_select" || fieldType == "radio"
		if choice && (!optionsOK || len(options) == 0) {
			return fmt.Errorf("field %q requires at least one option", key)
		}
		seenOptions := map[string]bool{}
		for j, rawOption := range options {
			option, ok := rawOption.(map[string]interface{})
			if !ok {
				return fmt.Errorf("field %q option %d must be an object", key, j)
			}
			optionKey, _ := option["key"].(string)
			label, _ := option["label"].(string)
			if strings.TrimSpace(optionKey) == "" || len(optionKey) > 120 || seenOptions[optionKey] {
				return fmt.Errorf("field %q option %d has an invalid or duplicate key", key, j)
			}
			if strings.TrimSpace(label) == "" || len(label) > 500 {
				return fmt.Errorf("field %q option %d has an invalid label", key, j)
			}
			seenOptions[optionKey] = true
		}
		min, hasMin := field["min"].(float64)
		max, hasMax := field["max"].(float64)
		if _, exists := field["min"]; exists && !hasMin {
			return fmt.Errorf("field %q minimum must be numeric", key)
		}
		if _, exists := field["max"]; exists && !hasMax {
			return fmt.Errorf("field %q maximum must be numeric", key)
		}
		if (hasMin && (math.IsNaN(min) || math.IsInf(min, 0))) || (hasMax && (math.IsNaN(max) || math.IsInf(max, 0))) {
			return fmt.Errorf("field %q has invalid numeric bounds", key)
		}
		if hasMin && hasMax && min > max {
			return fmt.Errorf("field %q minimum exceeds maximum", key)
		}
	}
	records, recordsOK := cfg["records"].([]interface{})
	if _, exists := cfg["records"]; exists && !recordsOK {
		return fmt.Errorf("records must be an array")
	}
	if len(records) > 1000 {
		return fmt.Errorf("records exceeds 1000")
	}
	return nil
}
