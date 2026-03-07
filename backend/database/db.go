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

// DB is the package-level database handle.
var DB *sql.DB

func envInt(key string, def int) int {
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

// NewRedisClient returns a *redis.Client from REDIS_URL.
func NewRedisClient() *redis.Client {
	addr := os.Getenv("REDIS_URL")
	if addr == "" {
		log.Fatal("REDIS_URL is required")
	}
	opts, err := redis.ParseURL(addr)
	if err != nil {
		log.Fatalf("database: invalid REDIS_URL: %v", err)
	}
	return redis.NewClient(opts)
}

// Init opens the database connection using DATABASE_URL.
func Init() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	DB.SetMaxOpenConns(envInt("DB_MAX_OPEN_CONNS", 100))
	DB.SetMaxIdleConns(envInt("DB_MAX_IDLE_CONNS", 50))
	DB.SetConnMaxLifetime(time.Duration(envInt("DB_CONN_MAX_LIFETIME_MIN", 30)) * time.Minute)
	DB.SetConnMaxIdleTime(time.Duration(envInt("DB_CONN_MAX_IDLE_TIME_MIN", 5)) * time.Minute)

	return nil
}

// Close closes the database connection.
func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}
