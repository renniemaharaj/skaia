package main

import (
	"strings"
	"testing"
)

func TestUpdateEnvTextReplacesAndAppendsFlags(t *testing.T) {
	input := "POSTGRES_USER=skaia\nPAGE_NORMALIZED_SECTION_READS=0\n"
	updated, changed := updateEnvText(input, map[string]string{
		"PAGE_TYPED_SECTION_MUTATIONS":          "1",
		"PAGE_NORMALIZED_INTERACTIVE_RESPONSES": "1",
		"PAGE_NORMALIZED_SECTION_READS":         "1",
	})
	if !changed {
		t.Fatal("env update reported no change")
	}
	for _, expected := range []string{
		"PAGE_TYPED_SECTION_MUTATIONS=1",
		"PAGE_NORMALIZED_INTERACTIVE_RESPONSES=1",
		"PAGE_NORMALIZED_SECTION_READS=1",
	} {
		if strings.Count(updated, expected) != 1 {
			t.Fatalf("expected one %q in:\n%s", expected, updated)
		}
	}
}

func TestUpdateEnvTextIsIdempotent(t *testing.T) {
	input := "PAGE_TYPED_SECTION_MUTATIONS=1\nPAGE_NORMALIZED_INTERACTIVE_RESPONSES=1\nPAGE_NORMALIZED_SECTION_READS=0\n"
	updated, changed := updateEnvText(input, map[string]string{
		"PAGE_TYPED_SECTION_MUTATIONS":          "1",
		"PAGE_NORMALIZED_INTERACTIVE_RESPONSES": "1",
		"PAGE_NORMALIZED_SECTION_READS":         "0",
	})
	if changed || updated != input {
		t.Fatalf("idempotent update changed env:\n%s", updated)
	}
}
