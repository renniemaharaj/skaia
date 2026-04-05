package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// envDefaultEntry keeps insertion order for the defaults registry.
type envDefaultEntry struct {
	Key   string
	Value string
}

// envDefaults is the authoritative list of env vars every client should have.
// When `grengo migrate` runs it appends any that are missing with these values.
// Keys already present in the .env are NEVER overwritten.
//
// To add a new env var: just add it here AND in the cmdNew template.
var envDefaults = []envDefaultEntry{
	// Redis
	{"REDIS_URL", "redis://redis:6379"},
	// Auth
	{"SESSION_TIMEOUT_MIN", "43200"}, // 1 month = 30d × 24h × 60m
	{"ENVIRONMENT", "production"},
	// Frontend SSR
	{"INDEX_FILE_PATH", "/app/frontend/dist/index.html"},
	// Features
	{"FEATURES_ENABLED", "landing,store,forum,cart,users,inbox,presence"},
	// Payments
	{"PAYMENT_PROVIDER", "demo"},
	{"STRIPE_SECRET_KEY", ""},
	{"STRIPE_WEBHOOK_SECRET", ""},
	// Tuning
	{"DB_MAX_OPEN_CONNS", "100"},
	{"DB_MAX_IDLE_CONNS", "50"},
	{"DB_CONN_MAX_LIFETIME_MIN", "30"},
	{"DB_CONN_MAX_IDLE_TIME_MIN", "5"},
	{"WS_MAX_CONNECTIONS", "100000"},
	{"WS_MAX_WORKERS", "256"},
	{"WS_SESSION_SIZE", "100"},
	{"WS_CHAT_RING_SIZE", "80"},
	{"WS_PRESENCE_INTERVAL_MS", "1000"},
	{"HTTP_READ_TIMEOUT_SEC", "15"},
	{"HTTP_WRITE_TIMEOUT_SEC", "15"},
	{"HTTP_IDLE_TIMEOUT_SEC", "60"},
	{"HTTP_SHUTDOWN_TIMEOUT_SEC", "30"},
	// Upload limits
	{"MAX_UPLOAD_PER_USER_MB", "500"},
	{"MAX_UPLOAD_TOTAL_MB", "5000"},
	// Grengo internal API
	{"GRENGO_API_URL", "http://host.docker.internal:9100"},
}

// syncEnvDefaults reads a client's .env, appends any keys from envDefaults
// that are missing, and writes the file back. Existing values are never touched.
// Returns the number of keys added.
func syncEnvDefaults(name string) int {
	envFile := clientEnvFile(name)
	existing := loadEnvMap(envFile)

	var toAdd []envDefaultEntry
	for _, d := range envDefaults {
		if _, ok := existing[d.Key]; !ok {
			toAdd = append(toAdd, d)
		}
	}

	if len(toAdd) == 0 {
		return 0
	}

	// Read original content so we can append cleanly.
	raw, err := os.ReadFile(envFile)
	if err != nil {
		warn("Cannot read %s: %v", envFile, err)
		return 0
	}

	content := string(raw)
	// Make sure the existing content ends with a newline.
	if len(content) > 0 && !strings.HasSuffix(content, "\n") {
		content += "\n"
	}

	content += fmt.Sprintf("\n# Defaults added by grengo migrate – %s\n", time.Now().Format(time.RFC3339))
	for _, d := range toAdd {
		content += fmt.Sprintf("%s=%s\n", d.Key, d.Value)
	}

	if err := os.WriteFile(envFile, []byte(content), 0644); err != nil {
		warn("Cannot write %s: %v", envFile, err)
		return 0
	}

	return len(toAdd)
}

// envVal reads a single key from an .env file without sourcing the whole file.
func envVal(file, key string) string {
	f, err := os.Open(file)
	if err != nil {
		return ""
	}
	defer f.Close()

	prefix := key + "="
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, prefix) {
			return strings.TrimPrefix(line, prefix)
		}
	}
	return ""
}

// loadEnvMap reads an entire .env file into a map.
func loadEnvMap(file string) map[string]string {
	m := make(map[string]string)
	f, err := os.Open(file)
	if err != nil {
		return m
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if idx := strings.Index(line, "="); idx > 0 {
			m[line[:idx]] = line[idx+1:]
		}
	}
	return m
}

// SharedEnv holds root-level Postgres config.
type SharedEnv struct {
	PostgresUser     string
	PostgresPassword string
	PGPort           string
}

// loadSharedEnv reads the root .env and returns shared config.
func loadSharedEnv() SharedEnv {
	m := loadEnvMap(rootEnvFile())
	env := SharedEnv{
		PostgresUser:     m["POSTGRES_USER"],
		PostgresPassword: m["POSTGRES_PASSWORD"],
		PGPort:           m["PGPORT"],
	}
	if env.PostgresUser == "" {
		env.PostgresUser = "skaia"
	}
	if env.PGPort == "" {
		env.PGPort = "5432"
	}
	return env
}

// writeEnvFile writes a map of key-value pairs as an .env file, preserving order via keys slice.
func writeEnvFile(file string, lines []string) error {
	return os.WriteFile(file, []byte(strings.Join(lines, "\n")+"\n"), 0644)
}

// usedPorts returns all PORT values from client .env files, sorted.
func usedPorts() []int {
	var ports []int
	entries, err := os.ReadDir(backendsDir())
	if err != nil {
		return ports
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		envFile := filepath.Join(backendsDir(), e.Name(), ".env")
		if val := envVal(envFile, "PORT"); val != "" {
			if p, err := strconv.Atoi(val); err == nil {
				ports = append(ports, p)
			}
		}
	}
	sort.Ints(ports)
	return ports
}

// nextPort returns the next available port.
func nextPort() int {
	ports := usedPorts()
	if len(ports) == 0 {
		return BasePort
	}
	return ports[len(ports)-1] + 1
}

// portInUse checks if a port is already assigned.
func portInUse(port int) bool {
	for _, p := range usedPorts() {
		if p == port {
			return true
		}
	}
	return false
}

// clientExists checks if a client directory exists.
func clientExists(name string) bool {
	info, err := os.Stat(filepath.Join(backendsDir(), name))
	return err == nil && info.IsDir()
}

// clientEnabled checks if a client exists and is not disabled.
func clientEnabled(name string) bool {
	if !clientExists(name) {
		return false
	}
	_, err := os.Stat(filepath.Join(backendsDir(), name, ".disabled"))
	return os.IsNotExist(err)
}

// validateName checks that a client name is valid.
func validateName(name string) {
	if name == "" {
		die("Name is required")
	}
	if len(name) > 32 {
		die("Name must be ≤ 32 characters")
	}
	if name[0] < 'a' || name[0] > 'z' {
		die("Name must start with a lowercase letter")
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
			die("Name must contain only lowercase letters, numbers, hyphens")
		}
	}
}

// clientEnvFile returns the path to a client's .env file.
func clientEnvFile(name string) string {
	return filepath.Join(backendsDir(), name, ".env")
}

// clientComposeFile returns the path to a client's compose.yml.
func clientComposeFile(name string) string {
	return filepath.Join(backendsDir(), name, "compose.yml")
}

// setEnvVal updates or appends a key=value in .env while preserving other lines.
func setEnvVal(file, key, value string) error {
	content, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	lines := strings.Split(string(content), "\n")
	prefix := key + "="
	updated := false
	for i, line := range lines {
		if strings.HasPrefix(line, prefix) {
			lines[i] = prefix + value
			updated = true
			break
		}
	}
	if !updated {
		lines = append(lines, prefix+value)
	}
	return os.WriteFile(file, []byte(strings.Join(lines, "\n")), 0644)
}

// clientDir returns the path to a client directory.
func clientDir(name string) string {
	return filepath.Join(backendsDir(), name)
}

// formatListRow formats a table row for the list command.
func formatListRow(name, port, status, running, domains string) string {
	return fmt.Sprintf("%-20s %-8s %-22s %-22s %s", name, port, status, running, domains)
}
