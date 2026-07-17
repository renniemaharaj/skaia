package page

import (
	"encoding/json"
	"strings"
	"testing"
)

func interactiveContent(config string) string {
	sections := []map[string]interface{}{{
		"id": 7, "display_order": 1, "section_type": "poll", "heading": "Poll", "config": config,
	}}
	raw, _ := json.Marshal(sections)
	return string(raw)
}

func TestMergeInteractiveRecordsPreservesConcurrentResponses(t *testing.T) {
	current := interactiveContent(`{"fields":[{"key":"choice","type":"radio"}],"records":[{"id":"r1","user_id":2,"answers":{"choice":"a"}}]}`)
	incoming := interactiveContent(`{"fields":[{"key":"choice","type":"radio","label":"Updated"}],"records":[],"result_summary":{"total":0}}`)
	merged, err := mergeInteractiveRecords(current, incoming)
	if err != nil {
		t.Fatal(err)
	}
	config, err := extractInteractiveConfig(merged, 7)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(config, `"id":"r1"`) {
		t.Fatalf("response was lost during builder merge: %s", config)
	}
	if strings.Contains(config, "result_summary") {
		t.Fatalf("derived result summary must not be persisted: %s", config)
	}
}

func TestSanitizeInteractiveContentDoesNotAggregateFreeText(t *testing.T) {
	content := interactiveContent(`{"result_visibility":"always","fields":[{"key":"secret","type":"textarea"},{"key":"choice","type":"radio"}],"records":[{"id":"r1","user_id":2,"answers":{"secret":"private answer","choice":"a"}}]}`)
	sanitized := SanitizeInteractiveContent(content, 3, false)
	if strings.Contains(sanitized, "private answer") {
		t.Fatalf("free-text answer leaked in sanitized page content: %s", sanitized)
	}
	if !strings.Contains(sanitized, `\"a\":1`) {
		t.Fatalf("structured aggregate missing from sanitized content: %s", sanitized)
	}
}

func TestClearInteractiveRecordsForDuplicate(t *testing.T) {
	content := interactiveContent(`{"fields":[],"records":[{"id":"r1"}]}`)
	cleared := ClearInteractiveRecords(content)
	if strings.Contains(cleared, `"r1"`) {
		t.Fatalf("duplicated page retained submitted data: %s", cleared)
	}
}
