package s_registry

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/google/jsonschema-go/jsonschema"
)

var (
	ErrUnknownContract      = errors.New("unknown section contract")
	ErrContractValueInvalid = errors.New("section contract value is invalid")
)

// ContractValueError identifies the failed contract without copying user config
// or sensitive response values into API errors, logs, or WebSocket payloads.
type ContractValueError struct {
	Contract string `json:"contract"`
}

func (e *ContractValueError) Error() string {
	return fmt.Sprintf("%s: %s", ErrContractValueInvalid, e.Contract)
}

func (e *ContractValueError) Unwrap() error { return ErrContractValueInvalid }

type compiledContractSet struct {
	contracts map[string]*jsonschema.Resolved
	err       error
}

var (
	compiledContractsOnce sync.Once
	compiledContracts     compiledContractSet
)

// ValidateContractValue validates a normalized value against an embedded
// canonical contract. It is intentionally separate from ValidateContent: legacy
// pages still need shell extraction, config migration, and response separation
// before their values satisfy the normalized contracts.
func ValidateContractValue(contractName string, value any) error {
	set := resolvedContractSchemas()
	if set.err != nil {
		return fmt.Errorf("compile section contracts: %w", set.err)
	}
	contract, ok := set.contracts[contractName]
	if !ok {
		return ErrUnknownContract
	}
	if err := contract.Validate(value); err != nil {
		return &ContractValueError{Contract: contractName}
	}
	if err := validateContractColors(contractName, value); err != nil {
		return &ContractValueError{Contract: contractName}
	}
	return nil
}

// ValidateNormalizedSectionConfig validates section-specific config after the
// compatibility adapter has removed legacy shared-shell and runtime-only fields.
func ValidateNormalizedSectionConfig(sectionType string, config map[string]any) error {
	if !IsSupported(sectionType) {
		return ErrUnknownContract
	}
	return ValidateContractValue(SectionConfigContractName(sectionType), config)
}

func resolvedContractSchemas() compiledContractSet {
	compiledContractsOnce.Do(func() {
		compiledContracts.contracts, compiledContracts.err = compileContractSchemas(embeddedContractSchemas)
	})
	return compiledContracts
}

func compileContractSchemas(rawContracts map[string]json.RawMessage) (map[string]*jsonschema.Resolved, error) {
	parsedByName := make(map[string]*jsonschema.Schema, len(rawContracts))
	parsedByID := make(map[string]*jsonschema.Schema, len(rawContracts))
	for name, raw := range rawContracts {
		var schema jsonschema.Schema
		if err := json.Unmarshal(raw, &schema); err != nil {
			return nil, fmt.Errorf("decode %s: %w", name, err)
		}
		if schema.ID == "" {
			return nil, fmt.Errorf("contract %s is missing $id", name)
		}
		if _, exists := parsedByID[schema.ID]; exists {
			return nil, fmt.Errorf("duplicate contract $id %q", schema.ID)
		}
		parsedByName[name] = &schema
		parsedByID[schema.ID] = &schema
	}

	loader := func(uri *url.URL) (*jsonschema.Schema, error) {
		withoutFragment := *uri
		withoutFragment.Fragment = ""
		schema, ok := parsedByID[withoutFragment.String()]
		if !ok {
			return nil, fmt.Errorf("contract reference %q is not embedded", withoutFragment.String())
		}
		return schema.CloneSchemas(), nil
	}

	resolved := make(map[string]*jsonschema.Resolved, len(parsedByName))
	for name, schema := range parsedByName {
		contract, err := schema.CloneSchemas().Resolve(&jsonschema.ResolveOptions{
			Loader:           loader,
			ValidateDefaults: true,
		})
		if err != nil {
			return nil, fmt.Errorf("resolve %s: %w", name, err)
		}
		resolved[name] = contract
	}
	return resolved, nil
}

var hexColorPattern = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`)
var colorFunctionPattern = regexp.MustCompile(`^(rgb|rgba|hsl|hsla)\((.*)\)$`)

func validateContractColors(contractName string, value any) error {
	object, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	switch contractName {
	case SharedSectionShellV1:
		for _, field := range []string{"background_color", "text_color", "h1_color", "h2_color", "h3_color"} {
			source, _ := object[field].(map[string]any)
			if source["mode"] == "literal" && !isSafeCSSColorString(source["value"]) {
				return errors.New("invalid literal color")
			}
		}
	case PageThemeV1:
		tokens, _ := object["tokens"].([]any)
		for _, tokenValue := range tokens {
			token, _ := tokenValue.(map[string]any)
			if !isSafeCSSColorString(token["value"]) {
				return errors.New("invalid palette color")
			}
		}
	case SectionConfigContractName("hero"):
		if color, exists := object["tint_color"]; exists && !isSafeCSSColorString(color) {
			return errors.New("invalid hero tint color")
		}
	}
	return nil
}

func isSafeCSSColorString(value any) bool {
	color, ok := value.(string)
	if !ok || strings.TrimSpace(color) != color || color == "" {
		return false
	}
	if hexColorPattern.MatchString(color) {
		return true
	}
	switch strings.ToLower(color) {
	case "black", "white", "transparent", "currentcolor":
		return true
	}
	matches := colorFunctionPattern.FindStringSubmatch(strings.ToLower(color))
	if matches == nil {
		return false
	}
	parts := strings.Split(matches[2], ",")
	switch matches[1] {
	case "rgb":
		return len(parts) == 3 && validRGBChannels(parts[:3])
	case "rgba":
		return len(parts) == 4 && validRGBChannels(parts[:3]) && validAlpha(parts[3])
	case "hsl":
		return len(parts) == 3 && validHue(parts[0]) && validPercentage(parts[1]) && validPercentage(parts[2])
	case "hsla":
		return len(parts) == 4 && validHue(parts[0]) && validPercentage(parts[1]) && validPercentage(parts[2]) && validAlpha(parts[3])
	default:
		return false
	}
}

func validRGBChannels(parts []string) bool {
	percent := strings.HasSuffix(strings.TrimSpace(parts[0]), "%")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasSuffix(part, "%") != percent {
			return false
		}
		maximum := 255.0
		if percent {
			maximum = 100
			part = strings.TrimSuffix(part, "%")
		}
		value, err := strconv.ParseFloat(part, 64)
		if err != nil || value < 0 || value > maximum {
			return false
		}
	}
	return true
}

func validHue(part string) bool {
	value, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(part, "deg")), 64)
	return err == nil && value >= -360 && value <= 360
}

func validPercentage(part string) bool {
	part = strings.TrimSpace(part)
	if !strings.HasSuffix(part, "%") {
		return false
	}
	value, err := strconv.ParseFloat(strings.TrimSuffix(part, "%"), 64)
	return err == nil && value >= 0 && value <= 100
}

func validAlpha(part string) bool {
	part = strings.TrimSpace(part)
	if strings.HasSuffix(part, "%") {
		return validPercentage(part)
	}
	value, err := strconv.ParseFloat(part, 64)
	return err == nil && value >= 0 && value <= 1
}
