package config

import "testing"

func TestOptionalFeaturesAreExplicitlyOptIn(t *testing.T) {
	t.Setenv("FEATURES_ENABLED", "")
	for _, feature := range []string{"status", "rewards", "rankings", "community"} {
		if getFeaturesStatus()[feature] {
			t.Fatalf("%s feature enabled without opt-in", feature)
		}
	}
	t.Setenv("FEATURES_ENABLED", "landing,status,rewards,rankings,community")
	status := getFeaturesStatus()
	if !status["status"] || !status["rewards"] || !status["rankings"] || !status["community"] || !status["landing"] || status["store"] {
		t.Fatalf("unexpected feature status: %+v", status)
	}
	enabled := getEnabledFeatures()
	for _, want := range []string{"status", "rewards", "rankings", "community"} {
		found := false
		for _, feature := range enabled {
			found = found || feature == want
		}
		if !found {
			t.Fatalf("enabled feature projection omitted %s", want)
		}
	}
}
