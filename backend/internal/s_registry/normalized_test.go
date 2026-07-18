package s_registry

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestEverySectionDefaultDecodesIntoItsGeneratedGoDTO(t *testing.T) {
	for _, value := range SectionTypes() {
		sectionType, ok := ParseNormalizedSectionType(value)
		if !ok {
			t.Fatalf("generated discriminator is missing %q", value)
		}
		config, err := DefaultNormalizedSectionConfig(sectionType)
		if err != nil {
			t.Fatalf("decode %s default: %v", value, err)
		}
		if config == nil || reflect.TypeOf(config).Kind() != reflect.Pointer {
			t.Fatalf("%s default did not produce a generated DTO: %T", value, config)
		}
	}
}

func TestDecodeNormalizedSectionConfigReturnsTypedConfig(t *testing.T) {
	config, err := DecodeNormalizedSectionConfig(SectionTypeHero, json.RawMessage(`{
		"background_image":"/hero.png",
		"tint_color":"#123456",
		"tint_opacity":0.4,
		"variant":2,
		"videos":[]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	hero, ok := config.(*HeroConfig)
	if !ok {
		t.Fatalf("expected *HeroConfig, got %T", config)
	}
	if hero.BackgroundImage == nil || *hero.BackgroundImage != "/hero.png" || hero.Variant == nil || *hero.Variant != 2 {
		t.Fatalf("unexpected typed hero config: %#v", hero)
	}
}

func TestDecodeNormalizedSectionConfigRejectsSchemaViolations(t *testing.T) {
	for _, raw := range []json.RawMessage{
		json.RawMessage(`{"unknown":true}`),
		json.RawMessage(`{"tint_opacity":2}`),
		json.RawMessage(`{"tint_color":"red; background:url(javascript:alert(1))"}`),
	} {
		if _, err := DecodeNormalizedSectionConfig(SectionTypeHero, raw); !errors.Is(err, ErrContractValueInvalid) {
			t.Fatalf("expected contract rejection for %s, got %v", raw, err)
		}
	}
}

func TestDecodeNormalizedSectionConfigRejectsAmbiguousOrMalformedJSON(t *testing.T) {
	secret := "private-response-value"
	for _, raw := range []json.RawMessage{
		json.RawMessage(`{"content":"first","content":"` + secret + `"}`),
		json.RawMessage(`{"content":"unterminated}`),
		json.RawMessage(`{"content":"ok"} {"content":"second"}`),
	} {
		_, err := DecodeNormalizedSectionConfig(SectionTypeRichText, raw)
		if !errors.Is(err, ErrNormalizedConfigJSONInvalid) {
			t.Fatalf("expected invalid JSON rejection, got %v", err)
		}
		if strings.Contains(err.Error(), secret) {
			t.Fatal("normalized JSON error exposed user content")
		}
	}
}

func TestDecodeNormalizedSectionConfigBoundsSizeAndDepth(t *testing.T) {
	tooLarge := json.RawMessage(strings.Repeat(" ", maxNormalizedConfigBytes+1))
	deep := json.RawMessage(`{"x":` + strings.Repeat("[", maxNormalizedConfigDepth+2) + `null` + strings.Repeat("]", maxNormalizedConfigDepth+2) + `}`)
	for _, raw := range []json.RawMessage{tooLarge, deep} {
		if _, err := DecodeNormalizedSectionConfig(SectionTypeHero, raw); !errors.Is(err, ErrNormalizedConfigJSONInvalid) {
			t.Fatalf("expected bounded JSON rejection, got %v", err)
		}
	}
}

func TestDecodeNormalizedSectionConfigRejectsUnknownDiscriminator(t *testing.T) {
	if _, ok := ParseNormalizedSectionType("mystery"); ok {
		t.Fatal("unknown type parsed as normalized discriminator")
	}
	if _, err := DecodeNormalizedSectionConfig(NormalizedSectionType("mystery"), json.RawMessage(`{}`)); !errors.Is(err, ErrUnknownContract) {
		t.Fatalf("expected unknown contract rejection, got %v", err)
	}
}
