package app

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"sync"
)

//go:embed migrations/*.sql
var grengoMigrationFiles embed.FS

var grengoServiceInit struct {
	sync.Mutex
	done bool
}

type grengoService struct {
	repo grengoRepository
}

func sqlLiteral(s string) string {
	return fmt.Sprintf("'%s'", s)
}

func newGrengoService() grengoService {
	return grengoService{repo: newGrengoRepository()}
}

func (s grengoService) EnsureReady() error {
	grengoServiceInit.Lock()
	defer grengoServiceInit.Unlock()

	if grengoServiceInit.done {
		return nil
	}
	if !pgRunning() {
		return fmt.Errorf("PostgreSQL container is not running")
	}

	env := loadSharedEnv()
	if !dbExists(grengoDatabaseName, env) {
		createSQL := fmt.Sprintf(`CREATE DATABASE "%s";`, grengoDatabaseName)
		if err := dockerExec("skaia-postgres", "psql", "-U", env.PostgresUser, "-d", "template1", "-c", createSQL); err != nil {
			return fmt.Errorf("create grengo database: %w", err)
		}
	}
	if err := s.runMigrations(); err != nil {
		return err
	}

	grengoServiceInit.done = true
	return nil
}

func (s grengoService) StorePasscode(encoded string) error {
	if err := s.EnsureReady(); err != nil {
		return err
	}
	return s.repo.StorePasscode(encoded)
}

func (s grengoService) LoadPasscode() (string, error) {
	if err := s.EnsureReady(); err != nil {
		return "", err
	}
	return s.repo.LoadPasscode()
}

func (s grengoService) ClearPasscode() error {
	if err := s.EnsureReady(); err != nil {
		return err
	}
	return s.repo.ClearPasscode()
}

func (s grengoService) RecordFrappeAllocation(record frappeAllocation) error {
	if err := s.EnsureReady(); err != nil {
		return err
	}
	return s.repo.RecordFrappeAllocation(record)
}

func (s grengoService) runMigrations() error {
	entries, err := fs.ReadDir(grengoMigrationFiles, "migrations")
	if err != nil {
		return fmt.Errorf("read grengo migrations: %w", err)
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		sql, err := grengoMigrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read grengo migration %s: %w", entry.Name(), err)
		}
		if err := s.repo.execSQL(sql); err != nil {
			return fmt.Errorf("run grengo migration %s: %w", entry.Name(), err)
		}
	}

	return nil
}
