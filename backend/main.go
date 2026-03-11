package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/auth"
	icfg "github.com/skaia/backend/internal/config"
	iforum "github.com/skaia/backend/internal/forum"
	iinbox "github.com/skaia/backend/internal/inbox"
	imw "github.com/skaia/backend/internal/middleware"
	inotif "github.com/skaia/backend/internal/notification"
	"github.com/skaia/backend/internal/ssr"
	istore "github.com/skaia/backend/internal/store"
	iupload "github.com/skaia/backend/internal/upload"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/ws"
)

// SimpleResponse is a basic JSON response.
type SimpleResponse struct {
	Message string `json:"message"`
	Status  string `json:"status"`
}

func envInt(key string, def int) int {
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

func main() {
	if err := database.Init(); err != nil {
		log.Fatalf("database init: %v", err)
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
		Addr:              ":" + port,
		Handler:           buildRouter(database.DB, hub),
		ReadTimeout:       time.Duration(envInt("HTTP_READ_TIMEOUT_SEC", 15)) * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      time.Duration(envInt("HTTP_WRITE_TIMEOUT_SEC", 15)) * time.Second,
		IdleTimeout:       time.Duration(envInt("HTTP_IDLE_TIMEOUT_SEC", 60)) * time.Second,
	}

	go func() {
		log.Printf("starting server on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down server")

	shutdownSec := envInt("HTTP_SHUTDOWN_TIMEOUT_SEC", 30)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(shutdownSec)*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("server forced shutdown: %v", err)
	}
	log.Println("server stopped")
}

func seedAdminPassword(db *sql.DB) {
	pw := os.Getenv("ADMIN_PASSWORD")
	if pw == "" {
		log.Println("ADMIN_PASSWORD not set, skipping admin seed")
		return
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		log.Printf("admin seed: hash failed: %v", err)
		return
	}
	if _, err := db.Exec(`UPDATE users SET password_hash = $1 WHERE username = 'admin'`, hash); err != nil {
		log.Printf("admin seed: update failed: %v", err)
		return
	}
	log.Println("admin seed: password updated")
}

func buildRouter(db *sql.DB, hub *ws.Hub) http.Handler {
	rdb := database.NewRedisClient()

	userRepo := iuser.NewRepository(db)
	userCache := iuser.NewCacheWithClient(rdb)
	userSvc := iuser.NewService(userRepo, userCache)

	forumCatRepo := iforum.NewCategoryRepository(db)
	forumThreadRepo := iforum.NewThreadRepository(db)
	forumCommentRepo := iforum.NewCommentRepository(db)
	forumCache := iforum.NewThreadCacheWithClient(rdb)
	forumSvc := iforum.NewService(forumCatRepo, forumThreadRepo, forumCommentRepo, forumCache)

	storeCatRepo := istore.NewCategoryRepository(db)
	storeProdRepo := istore.NewProductRepository(db)
	storeCartRepo := istore.NewCartRepository(db)
	storeOrdRepo := istore.NewOrderRepository(db)
	storePayRepo := istore.NewPaymentRepository(db)
	storePlanRepo := istore.NewSubscriptionPlanRepository(db)
	storeSubRepo := istore.NewSubscriptionRepository(db)
	storeCache := istore.NewProductCacheWithClient(rdb)
	storeProv := istore.NewPaymentProvider()
	storeSvc := istore.NewService(storeCatRepo, storeProdRepo, storeCartRepo, storeOrdRepo, storePayRepo, storePlanRepo, storeSubRepo, storeCache, storeProv)

	origins := []string{}
	if raw := os.Getenv("CORS_ORIGINS"); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			origins = append(origins, strings.TrimSpace(o))
		}
	}
	if len(origins) == 0 {
		log.Fatal("CORS_ORIGINS not set; provide comma-separated allowed origins")
	}

	r := chi.NewRouter()
	// Custom request logger that redacts sensitive query params (e.g. token)
	// from log output.  The default chi Logger prints the full RequestURI
	// which leaks JWTs for WebSocket upgrade requests.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()
			next.ServeHTTP(ww, r)
			// Build a safe URI: strip token from query string
			safeURI := r.URL.Path
			if r.URL.RawQuery != "" {
				q := r.URL.Query()
				if q.Get("token") != "" {
					q.Set("token", "[REDACTED]")
				}
				safeURI += "?" + q.Encode()
			}
			log.Printf("%q from %s - %d %dB in %s",
				r.Method+" "+r.Host+safeURI+" "+r.Proto,
				r.RemoteAddr, ww.Status(), ww.BytesWritten(), time.Since(start))
		})
	})
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		ExposedHeaders:   []string{},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{Message: "Skaia API is healthy", Status: "ok"})
	})

	r.Get("/time", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"now": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// websocket endpoints – keep both /api/ws and /ws for backwards compatibility
	r.Get("/api/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.HandleConnection(w, r, hub)
	})

	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.HandleConnection(w, r, hub)
	})

	// create a sub-router mounted at /api; the frontend already prefixes all
	// requests with /api so this keeps the handler signatures unchanged.
	api := chi.NewRouter()

	notifRepo := inotif.NewRepository(db)
	notifSvc := inotif.NewService(notifRepo, hub)

	iuser.NewHandler(userSvc, hub).Mount(api, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	iforum.NewHandler(forumSvc, hub, notifSvc, userSvc).Mount(api, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	istore.NewHandler(storeSvc, hub, userSvc).Mount(api, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	// upload handler needs to live at the root so that the nginx /uploads
	// proxy (which does not add an /api prefix) can retrieve files.  We also
	// register it on the api router so that the frontend's authenticated
	// POST endpoints (which are called via `/api/upload/...`) continue working.
	uploadHandler := iupload.NewHandler()
	uploadHandler.Mount(r, imw.JWTAuthMiddleware)   // registers /uploads/* + /upload/*
	uploadHandler.Mount(api, imw.JWTAuthMiddleware) // registers /api/uploads/* & /api/upload/*
	inotif.NewHandler(notifSvc).Mount(api, imw.JWTAuthMiddleware)

	inboxRepo := iinbox.NewRepository(db)
	inboxSvc := iinbox.NewService(inboxRepo, hub, userRepo)
	iinbox.NewHandler(inboxSvc).Mount(api, imw.JWTAuthMiddleware)

	cfgRepo := icfg.NewRepository(db)
	cfgSvc := icfg.NewService(cfgRepo)
	icfg.NewHandler(cfgSvc, userSvc).Mount(api, imw.JWTAuthMiddleware)

	// mount the assembled API router under /api on the top-level router
	r.Mount("/api", api)

	// Server-side index handler for SEO: returns index.html with injected head
	// tags (title, meta, og:image, favicon) built from site_config.
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		ssrHandler := ssr.IndexHandler(cfgSvc)
		ssrHandler(w, req)
	})

	// Serve static frontend assets directly from the build output. This mirrors
	// the nginx configuration used in production, allowing the Go backend to
	// stand alone (useful for local development or simplified deployments).
	//
	// The handler is installed as a NotFound fallback so that API routes defined
	// above take precedence. If the file exists on disk we serve it, otherwise
	// we fall back to the SSR index handler which injects head tags and returns
	// index.html (useful for client-side routing).
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {

		if strings.Contains(req.URL.Path, "..") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		fsPath := "frontend/dist" + req.URL.Path

		if info, err := os.Stat(fsPath); err == nil && !info.IsDir() {
			http.ServeFile(w, req, fsPath)
			return
		}

		ext := filepath.Ext(req.URL.Path)

		switch ext {
		case ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".map":
			http.NotFound(w, req)
			return
		}

		ssrHandler := ssr.IndexHandler(cfgSvc)
		ssrHandler(w, req)
	})

	return r
}
