package app

import (
	"strings"
	"testing"
)

func TestFeatureDefaultsOfferEverySupportedFeature(t *testing.T) {
	want := []string{
		"landing", "store", "forum", "docs", "cart", "users", "inbox", "presence",
		"status", "rewards", "rankings", "community",
	}
	if got := supportedFeatures(); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("supported features = %v, want %v", got, want)
	}
	if got := normalizeFeatures(allFeaturesCSV(), supportedFeatures()); got != allFeaturesCSV() {
		t.Fatalf("normalized defaults = %q, want %q", got, allFeaturesCSV())
	}
	for _, feature := range want {
		if !strings.Contains(featurePromptLabel(), feature) {
			t.Fatalf("new-client prompt omitted %q", feature)
		}
	}
}
