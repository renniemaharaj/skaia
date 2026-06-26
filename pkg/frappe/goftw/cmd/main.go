package main

import (
	"log"
	"os"

	internalBench "goftw/internal/bench"
	"goftw/internal/db"
	"goftw/internal/entity"
	"goftw/internal/environ"
	"goftw/internal/redis"
	"goftw/internal/grpcserver"

	// "goftw/internal/ssh"


)

func main() {
	dbCfg := db.Config{
		Host:     environ.GetEnv("MARIADB_HOST", "mariadb"),
		Port:     environ.GetEnv("MARIADB_PORT", "3306"),
		User:     environ.GetEnv("MARIADB_ROOT_USERNAME", "root"),
		Password: environ.GetEnv("MARIADB_ROOT_PASSWORD", "root"),
		Debug:    false,
		Wait:     true,
	}
	// Load instance.json
	instanceCfx, err := entity.LoadInstance(environ.GetInstanceFile())
	if err != nil {
		log.Fatalf("failed to load instance.json: %v", err)
	}

	// Load common_site_config.json
	commonCfg, err := entity.LoadCommonSitesConfig(environ.GetCommonSitesConfigPath())
	if err != nil {
		log.Fatalf("failed to load common_site_config.json: %v", err)
	}
	// deployment := instanceCfx.Deployment

	// Wait for DB
	if err := db.WaitForDB(dbCfg); err != nil {
		log.Fatalf("database check failed: %v", err)
	}
	// Wait for Redis
	for _, redisURL := range []string{commonCfg.RedisQueue, commonCfg.RedisCache, commonCfg.RedisSocketIO} {
		if err := redis.WaitForRedis(redis.Config{
			URL:   redisURL,
			Debug: os.Getenv("REDIS_DEBUG") == "1",
			Wait:  os.Getenv("WAIT_FOR_REDIS") != "0",
		}); err != nil {
			log.Fatalf("redis check failed: %v", err)
		}
	}
	// Initialize Bench if not exists
	bench := &internalBench.Bench{
		Name:       "frappe-bench",
		Path:       environ.GetBenchPath(),
		Branch:     instanceCfx.FrappeBranch,
		ServerName: instanceCfx.ServerName,
	}

	// Bench is defined but not automatically initialized. It must be initialized via API.

	// Ensure Bench struct is ready for API calls
	if _, err := os.Stat(bench.Path); err == nil {
		log.Printf("[BENCH] Bench directory %s exists", bench.Path)
	} else {
		log.Printf("[BENCH] Bench directory %s does not exist. Awaiting API initialization.", bench.Path)
	}

	grpcserver.StartServer(":3001", bench)
}
