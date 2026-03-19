package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

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

// clientDir returns the path to a client directory.
func clientDir(name string) string {
	return filepath.Join(backendsDir(), name)
}

// formatListRow formats a table row for the list command.
func formatListRow(name, port, status, running, domains string) string {
	return fmt.Sprintf("%-20s %-8s %-22s %-22s %s", name, port, status, running, domains)
}
