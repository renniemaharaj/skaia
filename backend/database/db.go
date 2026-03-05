package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

var DB *sql.DB

// dbEnvInt reads an integer from the environment, returning def when absent.
func dbEnvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		log.Printf("database: invalid %s=%q, using default %d", key, v, def)
		return def
	}
	return n
}

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

	DB.SetMaxOpenConns(dbEnvInt("DB_MAX_OPEN_CONNS", 100))
	DB.SetMaxIdleConns(dbEnvInt("DB_MAX_IDLE_CONNS", 50))
	// Recycle connections after N minutes to avoid stale connections after
	// network interruptions or server-side idle timeouts.
	DB.SetConnMaxLifetime(time.Duration(dbEnvInt("DB_CONN_MAX_LIFETIME_MIN", 30)) * time.Minute)
	// Discard idle connections after N minutes to avoid holding unnecessary
	// resources when traffic is low.
	DB.SetConnMaxIdleTime(time.Duration(dbEnvInt("DB_CONN_MAX_IDLE_TIME_MIN", 5)) * time.Minute)

	return nil
}

func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}
