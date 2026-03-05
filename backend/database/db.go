package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

var DB *sql.DB

// NewRedisClient returns a single *redis.Client configured from REDIS_URL
// (defaults to redis://localhost:6379). Call this once in main and pass the
// returned client to every cache layer via their "WithClient" constructors
// so all packages share one connection pool.
func NewRedisClient() *redis.Client {
	addr := os.Getenv("REDIS_URL")
	if addr == "" {
		addr = "redis://localhost:6379"
	}
	opts, err := redis.ParseURL(addr)
	if err != nil {
		log.Fatalf("database.NewRedisClient: invalid REDIS_URL %q: %v", addr, err)
	}
	return redis.NewClient(opts)
}

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

	DB.SetMaxOpenConns(50)
	DB.SetMaxIdleConns(25)
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
