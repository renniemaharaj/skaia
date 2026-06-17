package app

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

func normalizeFeatures(input string, allowed []string) string {
	allowedSet := map[string]bool{}
	for _, f := range allowed {
		allowedSet[f] = true
	}
	parts := strings.Split(input, ",")
	seen := map[string]bool{}
	var output []string
	for _, p := range parts {
		v := strings.TrimSpace(strings.ToLower(p))
		if v == "" {
			continue
		}
		if !allowedSet[v] {
			warn("Ignoring unknown feature: %s", v)
			continue
		}
		if !seen[v] {
			seen[v] = true
			output = append(output, v)
		}
	}
	return strings.Join(output, ",")
}

// ensureRootEnv creates the root .env interactively if it doesn't exist.
func ensureRootEnv() {
	if _, err := os.Stat(rootEnvFile()); err == nil {
		// Already exists
		return
	}

	fmt.Println()
	info("No root %s.env%s found — let's set up shared database credentials.", colorBold, colorReset)
	fmt.Println()

	pgUser := prompt("PostgreSQL user", "skaia", false)
	pgPass := prompt("PostgreSQL password", "", true)
	pgPort := prompt("PostgreSQL port", "5432", false)

	lines := []string{
		fmt.Sprintf("POSTGRES_USER=%s", pgUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", pgPass),
		fmt.Sprintf("PGPORT=%s", pgPort),
	}
	if err := writeEnvFile(rootEnvFile(), lines); err != nil {
		die("Cannot write root .env: %v", err)
	}
	log("Root .env created")
	fmt.Println()
}

// generateSecret returns a hex-encoded random string of the given byte length.
func generateSecret(nBytes int) string {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		die("Cannot generate random secret: %v", err)
	}
	return hex.EncodeToString(b)
}
