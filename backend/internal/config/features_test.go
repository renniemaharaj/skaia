package config

import "testing"

func TestStatusFeatureIsExplicitlyOptIn(t *testing.T) {
	t.Setenv("FEATURES_ENABLED", "")
	if getFeaturesStatus()["status"] {
		t.Fatal("status feature enabled without opt-in")
	}
	t.Setenv("FEATURES_ENABLED", "landing,status")
	status := getFeaturesStatus()
	if !status["status"] || !status["landing"] || status["store"] {
		t.Fatalf("unexpected feature status: %+v", status)
	}
	enabled := getEnabledFeatures()
	found := false
	for _, feature := range enabled {
		found = found || feature == "status"
	}
	if !found {
		t.Fatal("enabled feature projection omitted status")
	}
}
