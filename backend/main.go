package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/auth"
	iforum "github.com/skaia/backend/internal/forum"
	iinbox "github.com/skaia/backend/internal/inbox"
	imw "github.com/skaia/backend/internal/middleware"
	inotif "github.com/skaia/backend/internal/notification"
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

	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.HandleConnection(w, r, hub)
	})

	notifRepo := inotif.NewRepository(db)
	notifSvc := inotif.NewService(notifRepo, hub)

	iuser.NewHandler(userSvc, hub).Mount(r, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	iforum.NewHandler(forumSvc, hub, notifSvc, userSvc).Mount(r, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	istore.NewHandler(storeSvc, hub, userSvc).Mount(r, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
	iupload.NewHandler().Mount(r, imw.JWTAuthMiddleware)
	inotif.NewHandler(notifSvc).Mount(r, imw.JWTAuthMiddleware)

	inboxRepo := iinbox.NewRepository(db)
	inboxSvc := iinbox.NewService(inboxRepo, hub, userRepo)
	iinbox.NewHandler(inboxSvc).Mount(r, imw.JWTAuthMiddleware)

	return r
}
