// Package testutil provides shared helpers for integration tests.
package testutil

import (
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	_ "github.com/lib/pq"
)

// OpenTestDB opens a PostgreSQL connection using TEST_DATABASE_URL and applies
// all migrations so every integration test starts from a fully-seeded schema.
// The test is skipped automatically when TEST_DATABASE_URL is not set.
//
// Example:
//
//	func TestFoo(t *testing.T) {
//	    db := testutil.OpenTestDB(t)
//	    ...
//	}
func OpenTestDB(t testing.TB) *sql.DB {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping integration test")
	}

	db, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatalf("testutil.OpenTestDB: sql.Open: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Fatalf("testutil.OpenTestDB: ping: %v", err)
	}

	RunMigrations(t, db)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// RunMigrations executes every *.sql file found in the backend/migrations
// directory, ordered alphabetically (matching Docker init-db behaviour).
func RunMigrations(t testing.TB, db *sql.DB) {
	t.Helper()

	// Locate migrations relative to this source file:
	// internal/testutil/db.go => ../migrations
	_, self, _, _ := runtime.Caller(0)
	migrationsDir := filepath.Join(filepath.Dir(self), "..", "migrations")

	matches, err := filepath.Glob(filepath.Join(migrationsDir, "*.sql"))
	if err != nil {
		t.Fatalf("testutil.RunMigrations: glob: %v", err)
	}
	if len(matches) == 0 {
		t.Fatalf("testutil.RunMigrations: no *.sql files found in %s", migrationsDir)
	}
	sort.Strings(matches)

	for _, path := range matches {
		contents, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("testutil.RunMigrations: read %s: %v", path, err)
		}
		if _, err := db.Exec(string(contents)); err != nil {
			t.Fatalf("testutil.RunMigrations: exec %s: %v", filepath.Base(path), err)
		}
	}
}

// UniqueStr appends a short unique suffix to name so tests can run in
// parallel without colliding on unique-constrained columns.
func UniqueStr(name string) string {
	return fmt.Sprintf("%s_%d", name, uniqueSeq())
}

var seq int64

func uniqueSeq() int64 {
	seq++
	return seq
}

// TryConnect opens and pings the given DSN without requiring testing.TB.
// Useful for startup-time test-mode detection in main().
func TryConnect(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// ApplyMigrations runs every *.sql file from migrationsFS against db.
// migrationsFS should be an fs.FS rooted at the migrations directory (i.e.
// entries are plain filenames like "000_init_roles.sql", not paths).
// Errors containing "already exists" are silently ignored so re-runs are safe.
func ApplyMigrations(db *sql.DB, migrationsFS fs.FS) error {
	matches, err := fs.Glob(migrationsFS, "*.sql")
	if err != nil {
		return fmt.Errorf("ApplyMigrations: glob: %w", err)
	}
	if len(matches) == 0 {
		return fmt.Errorf("ApplyMigrations: no *.sql files found")
	}
	sort.Strings(matches)

	for _, name := range matches {
		contents, err := fs.ReadFile(migrationsFS, name)
		if err != nil {
			return fmt.Errorf("ApplyMigrations: read %s: %w", name, err)
		}
		if _, err := db.Exec(string(contents)); err != nil {
			if !strings.Contains(err.Error(), "already exists") {
				return fmt.Errorf("ApplyMigrations: exec %s: %w", name, err)
			}
		}
	}
	return nil
}
