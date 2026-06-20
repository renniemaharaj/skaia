package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	internalBench "goftw/internal/bench"
	"goftw/internal/db"
	"goftw/internal/entity"
	internalMiddleware "goftw/internal/middleware"

	"goftw/internal/environ"
	"goftw/internal/redis"

	// "goftw/internal/ssh"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
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
	deployment := instanceCfx.Deployment

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

	if _, err := os.Stat(bench.Path); os.IsNotExist(err) {
		log.Printf("[BENCH] Bench directory %s does not exist, initializing...", bench.Path)
		if err := bench.Initialize(bench.Branch); err != nil {
			log.Fatalf("bench init failed: %v", err)
		}
	} else {
		log.Printf("[BENCH] Bench directory %s exists, running test ...", bench.Path)
		_, err := bench.ExecRunInBenchSwallowIO("bench", "find", ".")
		if err != nil {
			log.Fatalf("[ERROR] Bench test failed: %v", err)
		}
		log.Printf("[BENCH] Bench test succeeded")
	}
	// Checkout sites for anomalies and missing sites
	if instanceCfx.RunSitesManager {
		if err := bench.CheckoutSites(instanceCfx, dbCfg.User, dbCfg.Password); err != nil {
			log.Fatalf("sites sync failed: %v", err)
		}
	}
	// Update bench and apps after deployment
	// if err := bench.ManualUpdate(benchDir); err != nil {
	// 	fmt.Printf("[ERROR] Failed to update bench: %v", err)
	// }
	// sites.MigrateAll(benchDir)

	// Deployment
	switch deployment {
	case "production":
		if err := bench.RunSupervisorNginx(); err != nil {
			fmt.Printf("[ERROR] Production mode failed: %v", err)
		}
	default:
		if err := bench.StartBench(); err != nil {
			fmt.Printf("[ERROR] Development mode failed: %v", err)
		}
	}

	// api restricted to sites-only for demo instance
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(internalMiddleware.CORS)

	r.Route("/api/goftw", func(r chi.Router) {
		// sites management endpoints only (apps endpoint disabled)
		r.Get("/sites", bench.ListSitesHandler)
		r.Get("/site/{name}", bench.GetSitesHandler)
		r.Put("/site/{name}", bench.PutSitesHandler)
	})

	fmt.Printf("[SERVER] Server running on :3000")
	err = http.ListenAndServe(":3000", r)
	if err != nil {
		fmt.Printf("[ERROR] Could not start server %v", err)
	}
}
