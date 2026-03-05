package database

import (
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func Init() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://skaia_user:skaia_password@localhost:5432/skaia?sslmode=disable"
	}

	var err error
	DB, err = sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	err = DB.Ping()
	if err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(10)
	// Recycle connections after 30 minutes to avoid stale connections after
	// network interruptions or server-side idle timeouts.
	DB.SetConnMaxLifetime(30 * time.Minute)
	// Discard idle connections after 5 minutes to avoid holding unnecessary
	// resources when traffic is low.
	DB.SetConnMaxIdleTime(5 * time.Minute)

	return nil
}

func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}
