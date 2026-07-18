package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGeneratedContractsAreCurrent(t *testing.T) {
	tests := []struct {
		path     string
		generate func() ([]byte, error)
	}{
		{
			path:     filepath.Join("..", "..", "..", "frontend", "src", "components", "page", "sectionContracts.generated.ts"),
			generate: generateTypeScript,
		},
		{
			path:     filepath.Join("..", "..", "internal", "s_registry", "section_configs_generated.go"),
			generate: generateGo,
		},
	}
	for _, test := range tests {
		generated, err := test.generate()
		if err != nil {
			t.Fatal(err)
		}
		current, err := os.ReadFile(test.path)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(current, generated) {
			t.Fatalf("%s is stale; run go generate ./internal/s_registry", test.path)
		}
	}
}

func TestGeneratedFrontendContractsContainTypedRegistryMetadata(t *testing.T) {
	generated, err := generateTypeScript()
	if err != nil {
		t.Fatal(err)
	}
	text := string(generated)
	for _, expected := range []string{
		"export interface SectionConfigByType",
		"export const SECTION_CONFIG_VERSIONS",
		"export const SECTION_DEFAULT_CONFIGS",
		`"hero": HeroConfig`,
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("generated contracts are missing %q", expected)
		}
	}
	if strings.Contains(text, `"records"`) {
		t.Fatal("generated canonical config types contain runtime records")
	}
}

func TestGeneratedGoContractsContainTypedFactories(t *testing.T) {
	generated, err := generateGo()
	if err != nil {
		t.Fatal(err)
	}
	text := string(generated)
	for _, expected := range []string{
		"type NormalizedSectionType string",
		"type HeroConfig struct",
		"type FormConfig struct",
		"normalizedSectionConfigFactories",
		"ParseNormalizedSectionType",
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("generated Go contracts are missing %q", expected)
		}
	}
}
