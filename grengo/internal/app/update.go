package app

import (
	"fmt"
	"os"
	"path/filepath"
)

func cmdUpdateClient(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	const oneHint = "Comma-separated list: landing, store, forum, cart, users, inbox, presence"
	current := envVal(clientEnvFile(name), "FEATURES_ENABLED")
	if current == "" {
		current = "landing,store,forum,cart,users,inbox,presence"
	}
	fmt.Println()
	fmt.Printf("Updating features for client %s\n", name)
	fmt.Printf("%s\n", oneHint)
	values := prompt("Enabled features", current, false)
	values = normalizeFeatures(values, []string{"landing", "store", "forum", "cart", "users", "inbox", "presence"})
	if values == "" {
		values = "landing,store,forum,cart,users,inbox,presence"
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
	const oneHint = "Comma-separated list: landing, store, forum, cart, users, inbox, presence"
	fmt.Println()
	fmt.Printf("Updating features for all clients\n")
	fmt.Printf("%s\n", oneHint)
	values := prompt("Enabled features", "landing,store,forum,cart,users,inbox,presence", false)
	values = normalizeFeatures(values, []string{"landing", "store", "forum", "cart", "users", "inbox", "presence"})
	if values == "" {
		values = "landing,store,forum,cart,users,inbox,presence"
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
