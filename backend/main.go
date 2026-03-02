package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/skaia/backend/database"
	iforum "github.com/skaia/backend/internal/forum"
	"github.com/skaia/backend/internal/integration"
	istore "github.com/skaia/backend/internal/store"
	"github.com/skaia/backend/internal/testutil"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/repository"
	"github.com/skaia/backend/websocket"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// SimpleResponse is a basic JSON response structure
type SimpleResponse struct {
	Message string `json:"message"`
	Status  string `json:"status"`
}

// AppContext is kept for the WebSocket handler which still relies on the legacy repos.
type AppContext struct {
	UserRepo          repository.UserRepository
	ProductRepo       repository.ProductRepository
	StoreCategoryRepo repository.StoreCategoryRepository
	CartRepo          repository.CartRepository
	OrderRepo         repository.OrderRepository
	ForumCategoryRepo repository.ForumCategoryRepository
	ForumThreadRepo   repository.ForumThreadRepository
	ThreadCommentRepo repository.ThreadCommentRepository
	WebSocketHub      *websocket.Hub
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

	hub := websocket.NewHub()
	go hub.Run()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Starting server on :%s", port)
	if err := http.ListenAndServe(":"+port, buildRouter(database.DB, hub)); err != nil {
		log.Fatal(err)
	}
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

	migrationsFS, _ := fs.Sub(migrationFiles, "migrations")
	if err := testutil.ApplyMigrations(db, migrationsFS); err != nil {
		log.Fatalf("integration: migrations failed: %v", err)
	}

	hub := websocket.NewHub()
	go hub.Run()

	suite := integration.NewSuite(buildRouter(db, hub))
	integration.RegisterUserTests(suite, db)
	integration.RegisterForumTests(suite, db)
	integration.RegisterStoreTests(suite, db)

	passed, failed := suite.Run()
	log.Printf("=== RESULTS: %d passed, %d failed ===", passed, failed)
	if failed > 0 {
		os.Exit(1)
	}
	os.Exit(0)
}

// buildRouter constructs the fully-mounted chi.Router for the given db and hub.
// This is used both in production and in the integration test suite.
func buildRouter(db *sql.DB, hub *websocket.Hub) http.Handler {
	// AppContext retains the legacy repos needed by the WebSocket handler.
	appCtx := &AppContext{
		UserRepo:          repository.NewUserRepository(db),
		ProductRepo:       repository.NewProductRepository(db),
		StoreCategoryRepo: repository.NewStoreCategoryRepository(db),
		CartRepo:          repository.NewCartRepository(db),
		OrderRepo:         repository.NewOrderRepository(db),
		ForumCategoryRepo: repository.NewForumCategoryRepository(db),
		ForumThreadRepo:   repository.NewForumThreadRepository(db),
		ThreadCommentRepo: repository.NewThreadCommentRepository(db),
		WebSocketHub:      hub,
	}

	// User domain
	userRepo := iuser.NewRepository(db)
	userCache := iuser.NewCache()
	userSvc := iuser.NewService(userRepo, userCache)

	// Forum domain
	forumCatRepo := iforum.NewCategoryRepository(db)
	forumThreadRepo := iforum.NewThreadRepository(db)
	forumCommentRepo := iforum.NewCommentRepository(db)
	forumCache := iforum.NewThreadCache()
	forumSvc := iforum.NewService(forumCatRepo, forumThreadRepo, forumCommentRepo, forumCache)

	// Store domain
	storeCatRepo := istore.NewCategoryRepository(db)
	storeProdRepo := istore.NewProductRepository(db)
	storeCartRepo := istore.NewCartRepository(db)
	storeOrdRepo := istore.NewOrderRepository(db)
	storeCache := istore.NewProductCache()
	storeSvc := istore.NewService(storeCatRepo, storeProdRepo, storeCartRepo, storeOrdRepo, storeCache)

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

	// WebSocket (legacy — still uses AppContext until WS handler is migrated)
	r.Get("/ws", WSHandler(appCtx))

	iuser.NewHandler(userSvc).Mount(r, JWTAuthMiddleware, OptionalJWTAuthMiddleware)
	iforum.NewHandler(forumSvc, hub).Mount(r, JWTAuthMiddleware, OptionalJWTAuthMiddleware)
	istore.NewHandler(storeSvc).Mount(r, JWTAuthMiddleware, OptionalJWTAuthMiddleware)

	return r
}
