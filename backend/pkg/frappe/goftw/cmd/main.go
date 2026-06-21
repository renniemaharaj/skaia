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

	// Bench is defined but not automatically initialized. It must be initialized via API.

	// Ensure Bench struct is ready for API calls
	if _, err := os.Stat(bench.Path); err == nil {
		log.Printf("[BENCH] Bench directory %s exists", bench.Path)
	} else {
		log.Printf("[BENCH] Bench directory %s does not exist. Awaiting API initialization.", bench.Path)
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

		r.Post("/maintenance/update", bench.UpdateHandler)
		r.Post("/maintenance/migrate", bench.MigrateHandler)
		r.Post("/maintenance/backup", bench.BackupHandler)

		r.Post("/setup/init", func(w http.ResponseWriter, r *http.Request) { bench.InitBenchHandler(w, r) })
		r.Post("/setup/sites", func(w http.ResponseWriter, r *http.Request) { bench.CheckoutSitesHandler(w, r, instanceCfx, dbCfg) })
		r.Post("/deployment/start", func(w http.ResponseWriter, r *http.Request) { bench.StartDeploymentHandler(w, r, deployment) })

		r.Post("/deployment/deploy", bench.RerunSupervisorNginx)
		r.Post("/deployment/nginx", bench.ReloadNginxHandler)
	})

	fmt.Printf("[SERVER] Server running on :3000")
	err = http.ListenAndServe(":3000", r)
	if err != nil {
		fmt.Printf("[ERROR] Could not start server %v", err)
	}
}
