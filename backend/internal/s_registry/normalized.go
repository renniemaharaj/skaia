package s_registry

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const maxNormalizedConfigBytes = 2 << 20
const maxNormalizedConfigDepth = 128

var ErrNormalizedConfigJSONInvalid = errors.New("normalized section config JSON is invalid")

// NormalizedConfigJSONError identifies malformed normalized input without
// copying page content into an API error or log message.
type NormalizedConfigJSONError struct {
	SectionType NormalizedSectionType `json:"section_type"`
}

func (e *NormalizedConfigJSONError) Error() string {
	return fmt.Sprintf("%s: %s", ErrNormalizedConfigJSONInvalid, e.SectionType)
}

func (e *NormalizedConfigJSONError) Unwrap() error { return ErrNormalizedConfigJSONInvalid }

// DecodeNormalizedSectionConfig validates raw normalized config and decodes it
// into the generated DTO selected by the typed section discriminator.
func DecodeNormalizedSectionConfig(sectionType NormalizedSectionType, raw json.RawMessage) (NormalizedSectionConfig, error) {
	factory, ok := normalizedSectionConfigFactories[sectionType]
	if !ok {
		return nil, ErrUnknownContract
	}
	if len(raw) == 0 || len(raw) > maxNormalizedConfigBytes || rejectDuplicateJSONKeys(raw) != nil {
		return nil, &NormalizedConfigJSONError{SectionType: sectionType}
	}

	decoder := json.NewDecoder(bytes.NewReader(raw))
	var object map[string]any
	if err := decoder.Decode(&object); err != nil || object == nil {
		return nil, &NormalizedConfigJSONError{SectionType: sectionType}
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return nil, &NormalizedConfigJSONError{SectionType: sectionType}
	}
	if err := ValidateNormalizedSectionConfig(string(sectionType), object); err != nil {
		return nil, err
	}

	config := factory()
	typedDecoder := json.NewDecoder(bytes.NewReader(raw))
	typedDecoder.DisallowUnknownFields()
	if err := typedDecoder.Decode(config); err != nil || ensureJSONEOF(typedDecoder) != nil {
		return nil, &NormalizedConfigJSONError{SectionType: sectionType}
	}
	return config, nil
}

// DefaultNormalizedSectionConfig returns a fresh typed instance of the schema
// default for sectionType.
func DefaultNormalizedSectionConfig(sectionType NormalizedSectionType) (NormalizedSectionConfig, error) {
	definition, ok := Get(string(sectionType))
	if !ok {
		return nil, ErrUnknownContract
	}
	return DecodeNormalizedSectionConfig(sectionType, definition.DefaultConfig)
}

func rejectDuplicateJSONKeys(raw []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := scanJSONValue(decoder, 0); err != nil {
		return err
	}
	return ensureJSONEOF(decoder)
}

func scanJSONValue(decoder *json.Decoder, depth int) error {
	if depth > maxNormalizedConfigDepth {
		return errors.New("JSON nesting exceeds limit")
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]struct{}{}
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("object key is not a string")
			}
			if _, duplicate := seen[key]; duplicate {
				return errors.New("duplicate object key")
			}
			seen[key] = struct{}{}
			if err := scanJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return errors.New("object is not closed")
		}
	case '[':
		for decoder.More() {
			if err := scanJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim(']') {
			return errors.New("array is not closed")
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	return nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values")
		}
		return err
	}
	return nil
}
