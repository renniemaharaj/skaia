package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// cmdDBInit creates a database and runs migrations for a client.
func cmdDBInit(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	if !pgRunning() {
		die("PostgreSQL is not running. Start infra first: grengo compose up")
	}

	env := loadSharedEnv()
	dbName := envVal(clientEnvFile(name), "POSTGRES_DB")
	if dbName == "" {
		die("POSTGRES_DB not set in %s", clientEnvFile(name))
	}

	if dbExists(dbName, env) {
		log("Database '%s' already exists – skipping creation", dbName)
		return
	}

	log("Creating database '%s'…", dbName)
	createSQL := fmt.Sprintf("CREATE DATABASE \"%s\";", dbName)
	if err := dockerExec("skaia-postgres", "psql", "-U", env.PostgresUser, "-d", "template1", "-c", createSQL); err != nil {
		die("Failed to create database: %v", err)
	}

	// Run migrations
	migrationsDir := filepath.Join(backendSrc(), "internal", "migrations")
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		warn("No migrations directory found at %s", migrationsDir)
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		migrationPath := filepath.Join(migrationsDir, entry.Name())
		info("  Running %s…", entry.Name())

		data, err := os.ReadFile(migrationPath)
		if err != nil {
			die("Cannot read migration %s: %v", entry.Name(), err)
		}
		if err := dockerExecInput("skaia-postgres", data, "psql", "-U", env.PostgresUser, "-d", dbName); err != nil {
			die("Migration %s failed: %v", entry.Name(), err)
		}
	}
	log("Database '%s' initialised", dbName)
}
