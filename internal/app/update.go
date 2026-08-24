package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func cmdUpdateClient(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	oneHint := "Comma-separated list: " + strings.Join(supportedFeatures(), ", ")
	current := envVal(clientEnvFile(name), "FEATURES_ENABLED")
	if current == "" {
		current = allFeaturesCSV()
	}
	fmt.Println()
	fmt.Printf("Updating features for client %s\n", name)
	fmt.Printf("%s\n", oneHint)
	values := prompt("Enabled features", current, false)
	values = normalizeFeatures(values, supportedFeatures())
	if values == "" {
		values = allFeaturesCSV()
	}
	if err := setEnvVal(clientEnvFile(name), "FEATURES_ENABLED", values); err != nil {
		die("Failed to update .env for %s: %v", name, err)
	}
	log("Updated %s: FEATURES_ENABLED=%s", name, values)
}

func cmdUpdateAll() {
	entries, err := os.ReadDir(backendsDir())
	if err != nil {
		die("Unable to read backends dir: %v", err)
	}
	oneHint := "Comma-separated list: " + strings.Join(supportedFeatures(), ", ")
	fmt.Println()
	fmt.Printf("Updating features for all clients\n")
	fmt.Printf("%s\n", oneHint)
	values := prompt("Enabled features", allFeaturesCSV(), false)
	values = normalizeFeatures(values, supportedFeatures())
	if values == "" {
		values = allFeaturesCSV()
	}

	updated := 0
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(backendsDir(), e.Name(), ".env")
		if _, err := os.Stat(path); err != nil {
			continue
		}
		if err := setEnvVal(path, "FEATURES_ENABLED", values); err != nil {
			warn("Failed to update %s: %v", e.Name(), err)
			continue
		}
		updated++
	}
	log("Updated %d clients with FEATURES_ENABLED=%s", updated, values)
}
