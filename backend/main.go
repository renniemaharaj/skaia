package main

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/auth"
	iforum "github.com/skaia/backend/internal/forum"
	iinbox "github.com/skaia/backend/internal/inbox"
	"github.com/skaia/backend/internal/integration"
	imw "github.com/skaia/backend/internal/middleware"
	inotif "github.com/skaia/backend/internal/notification"
	istore "github.com/skaia/backend/internal/store"
	"github.com/skaia/backend/internal/testutil"
	iupload "github.com/skaia/backend/internal/upload"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/ws"
)

//go:embed internal/migrations/*.sql
var migrationFiles embed.FS

// mainEnvInt reads an integer from the environment, returning def when absent.
func mainEnvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		log.Printf("main: invalid %s=%q, using default %d", key, v, def)
		return def
	}
	return n
}

// SimpleResponse is a basic JSON response structure
type SimpleResponse struct {
	Message string `json:"message"`
	Status  string `json:"status"`
}

func main() {
	// ── Mode selection ────────────────────────────────────────────────────────
	// The binary operates in exactly one of two modes:
	//
	//   Test mode:       TEST_DATABASE_URL is set  →  run integration suite, exit 0/1
	//   Production mode: TEST_DATABASE_URL absent   →  start HTTP server
	//
	// The two compose files enforce this cleanly:
	//   compose.yml      — production  (TEST_DATABASE_URL never set)
	//   compose.test.yml — test runner (TEST_DATABASE_URL points to postgres-test)

	if testURL := os.Getenv("TEST_DATABASE_URL"); testURL != "" {
		log.Println("TEST_DATABASE_URL set — running in test mode")
		testDB := tryConnectWithRetry(testURL, 10, 3*time.Second)
		if testDB == nil {
			log.Fatal("test mode: could not connect to test database after retries")
		}
		runIntegrationSuite(testDB) // calls os.Exit — never returns
	}

	// ── Production mode ───────────────────────────────────────────────────────
	if err := database.Init(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	seedAdminPassword(database.DB)

	hub := ws.NewHub()
	go hub.Run()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      buildRouter(database.DB, hub),
		ReadTimeout:  time.Duration(mainEnvInt("HTTP_READ_TIMEOUT_SEC", 15)) * time.Second,
		WriteTimeout: time.Duration(mainEnvInt("HTTP_WRITE_TIMEOUT_SEC", 15)) * time.Second,
		IdleTimeout:  time.Duration(mainEnvInt("HTTP_IDLE_TIMEOUT_SEC", 60)) * time.Second,
	}

	go func() {
		log.Printf("Starting server on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	// Block until SIGINT or SIGTERM is received.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server…")

	// Allow up to N seconds for in-flight requests to complete.
	shutdownSec := mainEnvInt("HTTP_SHUTDOWN_TIMEOUT_SEC", 30)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(shutdownSec)*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("server forced shutdown: %v", err)
	}
	log.Println("Server stopped")
}

// tryConnectWithRetry tries to open dsn up to maxRetries times, sleeping
// delay between attempts. Returns nil when all attempts fail.
func tryConnectWithRetry(dsn string, maxRetries int, delay time.Duration) *sql.DB {
	for i := 1; i <= maxRetries; i++ {
		db, err := testutil.TryConnect(dsn)
		if err == nil {
			log.Printf("Connected to test database on attempt %d/%d", i, maxRetries)
			return db
		}
		log.Printf("Test DB not ready (%d/%d): %v", i, maxRetries, err)
		if i < maxRetries {
			time.Sleep(delay)
		}
	}
	return nil
}

// runIntegrationSuite applies migrations to db, mounts a test HTTP server,
// runs every registered integration test, then exits with 0 (all pass) or 1.
func runIntegrationSuite(db *sql.DB) {
	defer db.Close()

	log.Println("=== INTEGRATION TEST MODE ===")

	// Wipe the schema so every run starts from a clean slate.
	// This is safe because postgres-test is a dedicated throw-away container.
	if _, err := db.Exec(`DROP SCHEMA public CASCADE`); err != nil {
		log.Fatalf("integration: drop schema: %v", err)
	}
	if _, err := db.Exec(`CREATE SCHEMA public`); err != nil {
		log.Fatalf("integration: create schema: %v", err)
	}

	migrationsFS, _ := fs.Sub(migrationFiles, "internal/migrations")
	if err := testutil.ApplyMigrations(db, migrationsFS); err != nil {
		log.Fatalf("integration: migrations failed: %v", err)
	}

	hub := ws.NewHub()
	go hub.Run()

	suite := integration.NewSuite(buildRouter(db, hub))
	integration.RegisterUserTests(suite, db)
	integration.RegisterForumTests(suite, db)
	integration.RegisterStoreTests(suite, db)
	integration.RegisterUploadTests(suite, db)
	integration.RegisterExtraTests(suite, db)

	passed, failed := suite.Run()
	log.Printf("=== RESULTS: %d passed, %d failed ===", passed, failed)
	if failed > 0 {
		os.Exit(1)
	}
	os.Exit(0)
}

// seedAdminPassword reads ADMIN_PASSWORD from the environment, bcrypt-hashes it,
// and updates the admin user's password_hash in the database.  This runs once on
// every startup so the admin password always matches the env var.
func seedAdminPassword(db *sql.DB) {
	pw := os.Getenv("ADMIN_PASSWORD")
	if pw == "" {
		log.Println("ADMIN_PASSWORD not set — skipping admin password seed")
		return
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		log.Printf("admin seed: failed to hash password: %v", err)
		return
	}
	if _, err := db.Exec(`UPDATE users SET password_hash = $1 WHERE username = 'admin'`, hash); err != nil {
		log.Printf("admin seed: failed to update password: %v", err)
		return
	}
	log.Println("admin seed: admin password updated from ADMIN_PASSWORD")
}

// buildRouter constructs the fully-mounted chi.Router for the given db and hub.
// This is used both in production and in the integration test suite.
func buildRouter(db *sql.DB, hub *ws.Hub) http.Handler {
	// User domain
	rdb := database.NewRedisClient()

	userRepo := iuser.NewRepository(db)
	userCache := iuser.NewCacheWithClient(rdb)
	userSvc := iuser.NewService(userRepo, userCache)

	// Forum domain
	forumCatRepo := iforum.NewCategoryRepository(db)
	forumThreadRepo := iforum.NewThreadRepository(db)
	forumCommentRepo := iforum.NewCommentRepository(db)
	forumCache := iforum.NewThreadCacheWithClient(rdb)
	forumSvc := iforum.NewService(forumCatRepo, forumThreadRepo, forumCommentRepo, forumCache)

	// Store domain
	storeCatRepo := istore.NewCategoryRepository(db)
	storeProdRepo := istore.NewProductRepository(db)
	storeCartRepo := istore.NewCartRepository(db)
	storeOrdRepo := istore.NewOrderRepository(db)
	storePayRepo := istore.NewPaymentRepository(db)
	storeCache := istore.NewProductCacheWithClient(rdb)
	storeProv := istore.NewPaymentProvider()
	storeSvc := istore.NewService(storeCatRepo, storeProdRepo, storeCartRepo, storeOrdRepo, storePayRepo, storeCache, storeProv)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"*"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{Message: "Skaia API is healthy", Status: "ok"})
	})

	// Server time endpoint — lets clients correct clock-skew before computing
	// relative timestamps. Returns the server's current UTC time in RFC 3339
	// format so the frontend can calibrate its local clock against the
	// authoritative backend clock regardless of timezone.
	r.Get("/time", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"now": time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.HandleConnection(w, r, hub)
	})

	// Notifications (created first so forum handler can send them)
	notifRepo := inotif.NewRepository(db)
	notifSvc := inotif.NewService(notifRepo, hub)

	iuser.NewHandler(userSvc, hub).Mount(r, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	iforum.NewHandler(forumSvc, hub, notifSvc, userSvc).Mount(r, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	istore.NewHandler(storeSvc, hub, userSvc).Mount(r, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	iupload.NewHandler().Mount(r, imw.JWTAuthMiddleware)

	inotif.NewHandler(notifSvc).Mount(r, imw.JWTAuthMiddleware)

	// Inbox (private messaging)
	inboxRepo := iinbox.NewRepository(db)
	inboxSvc := iinbox.NewService(inboxRepo, hub, userRepo)
	iinbox.NewHandler(inboxSvc).Mount(r, imw.JWTAuthMiddleware)

	return r
}
