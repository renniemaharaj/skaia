package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
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

	runMigrations(dbName, env)
	log("Database '%s' initialised", dbName)
}

// runMigrations executes every .sql file in the migrations directory against dbName.
func runMigrations(dbName string, env SharedEnv) {
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

		// Inject shared Postgres password from root .env, if template placeholder exists.
		sql := strings.ReplaceAll(string(data), "{{PGPASSWORD}}", env.PostgresPassword)

		if err := dockerExecInput("skaia-postgres", []byte(sql), "psql", "-U", env.PostgresUser, "-d", dbName); err != nil {
			die("Migration %s failed: %v", entry.Name(), err)
		}
	}
}

// ─── Migrate ──────────────────────────────────────────────────────────────────

// cmdMigrate re-runs all migration SQL files against an existing client database.
// Because every migration uses IF NOT EXISTS / ON CONFLICT DO NOTHING, this is
// safe to run on a live database — existing objects are untouched and any new
// tables, indexes, or seed rows are added.
//
// With --rebuild the command performs a full export → drop → recreate → migrate →
// restore cycle for more invasive schema changes.
func cmdMigrate(name string, rebuild bool) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}

	// Sync env defaults — add any missing keys from the registry.
	if n := syncEnvDefaults(name); n > 0 {
		log("Added %d missing env var(s) to %s", n, clientEnvFile(name))
	}

	if !pgRunning() {
		die("PostgreSQL is not running. Start infra first: grengo compose up")
	}

	env := loadSharedEnv()
	dbName := envVal(clientEnvFile(name), "POSTGRES_DB")
	if dbName == "" {
		die("POSTGRES_DB not set in %s", clientEnvFile(name))
	}
	if !dbExists(dbName, env) {
		die("Database '%s' does not exist — use 'grengo db init %s' first", dbName, name)
	}

	if rebuild {
		cmdMigrateRebuild(name, dbName, env)
		return
	}

	// Safety backup before applying migrations.
	backupFile := backupDatabase(name, dbName)
	log("Safety backup → %s", backupFile)

	log("Applying migrations to '%s'…", dbName)
	runMigrations(dbName, env)
	log("Migrate complete for '%s'", name)
}

// cmdMigrateRebuild performs a full data-only dump → drop → recreate → migrate →
// restore cycle.  Useful when schema changes go beyond additive (e.g. column
// renames, type changes).
func cmdMigrateRebuild(name, dbName string, env SharedEnv) {
	// 1. Stop the client so nothing writes while we rebuild.
	if clientRunning(name) {
		log("Stopping %s…", name)
		cmdStop(name)
	}

	// 2. Full pg_dump for safety, then data-only dump for restore.
	backupFile := backupDatabase(name, dbName)
	log("Full safety backup → %s", backupFile)

	log("Dumping data from '%s'…", dbName)
	dataSQL, err := pgDumpDataOnly(dbName)
	if err != nil {
		die("Data dump failed: %v", err)
	}

	// 3. Drop and recreate the database.
	log("Dropping database '%s'…", dbName)
	dropSQL := fmt.Sprintf(`DROP DATABASE "%s";`, dbName)
	if err := dockerExec("skaia-postgres", "psql", "-U", env.PostgresUser, "-d", "template1", "-c", dropSQL); err != nil {
		die("Failed to drop database: %v", err)
	}

	log("Recreating database '%s'…", dbName)
	createSQL := fmt.Sprintf(`CREATE DATABASE "%s";`, dbName)
	if err := dockerExec("skaia-postgres", "psql", "-U", env.PostgresUser, "-d", "template1", "-c", createSQL); err != nil {
		die("Failed to recreate database: %v", err)
	}

	// 4. Run fresh migrations (schema + seed).
	log("Running migrations…")
	runMigrations(dbName, env)

	// 5. Restore data (disable triggers so FKs don't block inserts).
	log("Restoring data…")
	if err := dockerExecInput("skaia-postgres", dataSQL, "psql", "-U", env.PostgresUser, "-d", dbName); err != nil {
		warn("Data restore reported errors (this may be normal for seed conflicts)")
	}

	log("Rebuild-migrate complete for '%s'", name)
}

// cmdMigrateAll runs migrate for every client on this node.
func cmdMigrateAll(rebuild bool) {
	entries, err := os.ReadDir(backendsDir())
	if err != nil || len(entries) == 0 {
		die("No clients found")
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if _, err := os.Stat(clientEnvFile(e.Name())); err != nil {
			continue
		}
		fmt.Println()
		log("── Migrating %s ──", e.Name())
		cmdMigrate(e.Name(), rebuild)
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// backupDatabase creates a timestamped pg_dump of dbName in the client directory
// and returns the resulting file path.
func backupDatabase(name, dbName string) string {
	dump, err := pgDump(dbName)
	if err != nil {
		die("Backup failed for '%s': %v", dbName, err)
	}
	ts := time.Now().Format("20060102-150405")
	backupFile := filepath.Join(clientDir(name), fmt.Sprintf("%s-backup-%s.sql", dbName, ts))
	if err := os.WriteFile(backupFile, dump, 0644); err != nil {
		die("Cannot write backup file: %v", err)
	}
	return backupFile
}

// pgDumpDataOnly runs pg_dump --data-only --disable-triggers inside the postgres
// container and returns the SQL bytes.
func pgDumpDataOnly(dbName string) ([]byte, error) {
	env := loadSharedEnv()
	return exec.Command(
		"docker", "exec", "skaia-postgres",
		"pg_dump", "-U", env.PostgresUser, "--data-only", "--disable-triggers", dbName,
	).Output()
}
