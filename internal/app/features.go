package app

import (
	"strings"

	"github.com/skaia/features"
)

func supportedFeatures() []string { return features.AllNames() }

func allFeaturesCSV() string { return strings.Join(supportedFeatures(), ",") }

func featurePromptLabel() string {
	return "Enabled features (comma-separated) - available: " + strings.Join(supportedFeatures(), ",")
}
