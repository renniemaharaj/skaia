package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
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
	ics "github.com/skaia/backend/internal/customsection"
	ids "github.com/skaia/backend/internal/datasource"
	iforum "github.com/skaia/backend/internal/forum"
	igrengo "github.com/skaia/backend/internal/grengo"
	iinbox "github.com/skaia/backend/internal/inbox"
	imw "github.com/skaia/backend/internal/middleware"
	inotif "github.com/skaia/backend/internal/notification"
	ipage "github.com/skaia/backend/internal/page"
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

var sitemapPaths = []string{
	"/",
	"/login",
	"/register",
	"/store",
	"/forum",
	"/cart",
	"/users",
	"/inbox",
}

func getSitemapBaseURL() string {
	if v := os.Getenv("SITEMAP_BASE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}

	domains := strings.Fields(os.Getenv("DOMAINS"))
	if len(domains) > 0 {
		d := domains[0]
		if !strings.HasPrefix(d, "http://") && !strings.HasPrefix(d, "https://") {
			d = "https://" + d
		}
		return strings.TrimRight(d, "/")
	}

	return "http://localhost:8080"
}

func buildSitemapXML(baseURL string) string {
	urlset := "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"

	for _, path := range sitemapPaths {
		loc := baseURL + path
		urlset += "  <url>\n"
		urlset += "    <loc>" + loc + "</loc>\n"
		urlset += "    <changefreq>daily</changefreq>\n"
		urlset += "    <priority>0.7</priority>\n"
		urlset += "  </url>\n"
	}

	urlset += "</urlset>\n"
	return urlset
}

func writeSitemapResponse(w http.ResponseWriter, r *http.Request) {
	client := chi.URLParam(r, "client")
	configuredClient := os.Getenv("CLIENT_NAME")
	if client != "" && configuredClient != "" && client != configuredClient {
		http.NotFound(w, r)
		return
	}

	baseURL := getSitemapBaseURL()
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}

	sitemap := buildSitemapXML(baseURL)
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(sitemap))
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
	hash, err := auth.HashPasswordUnchecked(pw)
	if err != nil {
		log.Printf("admin seed: hash failed: %v", err)
		return
	}

	email := os.Getenv("ADMIN_EMAIL")
	if email != "" {
		if _, err := db.Exec(`UPDATE users SET password_hash = $1, email = $2 WHERE username = 'admin'`, hash, email); err != nil {
			log.Printf("admin seed: update failed: %v", err)
			return
		}
		log.Println("admin seed: password and email updated")
	} else {
		if _, err := db.Exec(`UPDATE users SET password_hash = $1 WHERE username = 'admin'`, hash); err != nil {
			log.Printf("admin seed: update failed: %v", err)
			return
		}
		log.Println("admin seed: password updated")
	}
}

func validateArmHeaders(r *http.Request) (string, error) {
	clientID := r.Header.Get("X-Client-ID")
	adminPassword := r.Header.Get("X-Admin-Password")
	if clientID == "" || adminPassword == "" {
		return "", fmt.Errorf("missing authentication headers")
	}
	expectedClientID := os.Getenv("CLIENT_ID")
	expectedAdminPw := os.Getenv("ADMIN_PASSWORD")
	if expectedClientID == "" || expectedAdminPw == "" {
		return "", fmt.Errorf("server missing CLIENT_ID or ADMIN_PASSWORD")
	}
	if clientID != expectedClientID || adminPassword != expectedAdminPw {
		return "", fmt.Errorf("invalid credentials")
	}
	return clientID, nil
}

func writeArmedFile(armedDir, clientID string) error {
	if err := os.MkdirAll(armedDir, 0755); err != nil {
		return err
	}
	filePath := filepath.Join(armedDir, clientID+".armed")
	return os.WriteFile(filePath, []byte(time.Now().UTC().Format(time.RFC3339)), 0644)
}

func removeArmedFile(armedDir, clientID string) error {
	filePath := filepath.Join(armedDir, clientID+".armed")
	if _, err := os.Stat(filePath); err != nil {
		return err
	}
	return os.Remove(filePath)
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
	// Also derive origins from DOMAINS (both http and https, plus www. variants).
	if domains := os.Getenv("DOMAINS"); domains != "" {
		for _, d := range strings.Fields(domains) {
			origins = append(origins, "http://"+d, "https://"+d)
			if !strings.HasPrefix(d, "www.") {
				origins = append(origins, "http://www."+d, "https://www."+d)
			}
		}
	}
	// Deduplicate.
	seen := map[string]bool{}
	deduped := origins[:0]
	for _, o := range origins {
		if !seen[o] {
			seen[o] = true
			deduped = append(deduped, o)
		}
	}
	origins = deduped
	if len(origins) == 0 {
		log.Fatal("CORS_ORIGINS or DOMAINS must be set; provide allowed origins")
	}

	r := chi.NewRouter()
	// Inject X-Backend header on every response (identifies which tenant backend handled it).
	clientName := os.Getenv("CLIENT_NAME")
	if clientName == "" {
		clientName = "unknown"
	}
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Backend", clientName)
			next.ServeHTTP(w, r)
		})
	})
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

	// ── Health check at root (for Docker healthcheck probes) ───────────
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{Message: "Skaia API is healthy", Status: "ok"})
	})

	// ── Sitemap for SEO (per-client and default) ───────────────────────
	r.Get("/sitemap.xml", writeSitemapResponse)
	r.Get("/sitemap/{client}.xml", writeSitemapResponse)

	// ── WebSocket at root (nginx proxies /ws directly) ─────────────────
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.HandleConnection(w, r, hub)
	})

	// ── Static file serving for user uploads (at root — URLs are stored
	// in the DB as /uploads/users/…) ────────────────────────────────────
	r.Get("/uploads/*", iupload.ServeUploads)

	notifRepo := inotif.NewRepository(db)
	notifSvc := inotif.NewService(notifRepo, hub)

	// Bootstrap notification delivery on WS connect.
	hub.NotificationFetcher = func(userID int64) interface{} {
		notifs, err := notifSvc.List(userID, 50, 0)
		if err != nil || len(notifs) == 0 {
			return nil
		}
		return map[string]interface{}{"notifications": notifs}
	}

	cfgRepo := icfg.NewRepository(db)
	cfgSvc := icfg.NewService(cfgRepo)

	// ── All API routes under /api ──────────────────────────────────────
	r.Route("/api", func(api chi.Router) {
		armedDir := os.Getenv("ARMED_DIR")
		if armedDir == "" {
			armedDir = "armed"
		}
		api.Use(imw.ArmedMiddleware(armedDir, []string{"/api/arm", "/api/disarm", "/api/health", "/api/time", "/api/armed-status", "/api/auth/login", "/api/auth/refresh", "/api/grengo/"}))

		// Prevent Cloudflare (and browsers) from caching API responses.
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
				w.Header().Set("Pragma", "no-cache")
				next.ServeHTTP(w, r)
			})
		})
		api.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(SimpleResponse{Message: "Skaia API is healthy", Status: "ok"})
		})

		api.Get("/armed-status", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]bool{"armed": imw.IsArmed(armedDir)})
		})

		api.Post("/arm", func(w http.ResponseWriter, r *http.Request) {
			clientID, err := validateArmHeaders(r)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusUnauthorized)
				return
			}

			armedDir := os.Getenv("ARMED_DIR")
			if armedDir == "" {
				armedDir = "armed"
			}

			if err := writeArmedFile(armedDir, clientID); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(SimpleResponse{Message: "backend armed", Status: "ok"})
		})

		api.Post("/disarm", func(w http.ResponseWriter, r *http.Request) {
			clientID, err := validateArmHeaders(r)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusUnauthorized)
				return
			}

			armedDir := os.Getenv("ARMED_DIR")
			if armedDir == "" {
				armedDir = "armed"
			}

			if err := removeArmedFile(armedDir, clientID); err != nil {
				if os.IsNotExist(err) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusNotFound)
					json.NewEncoder(w).Encode(SimpleResponse{Message: "not armed", Status: "ok"})
					return
				}
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(SimpleResponse{Message: "backend disarmed", Status: "ok"})
		})

		api.Get("/time", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"now": time.Now().UTC().Format(time.RFC3339),
			})
		})

		api.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
			ws.HandleConnection(w, r, hub)
		})

		iuser.NewHandler(userSvc, hub).Mount(api, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
		iforum.NewHandler(forumSvc, hub, notifSvc, userSvc).Mount(api, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)
		istore.NewHandler(storeSvc, hub, userSvc).Mount(api, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)

		uploadHandler := iupload.NewHandler(hub)
		uploadHandler.Mount(api, imw.JWTAuthMiddleware)
		iupload.MountUserUploads(api, imw.JWTAuthMiddleware, userSvc, hub)

		inotif.NewHandler(notifSvc, hub).Mount(api, imw.JWTAuthMiddleware)

		inboxRepo := iinbox.NewRepository(db)
		inboxSvc := iinbox.NewService(inboxRepo, hub, userRepo)
		iinbox.NewHandler(inboxSvc).Mount(api, imw.JWTAuthMiddleware)

		icfg.NewHandler(cfgSvc, userSvc, hub).Mount(api, imw.JWTAuthMiddleware)

		pageRepo := ipage.NewRepository(db)
		pageSvc := ipage.NewService(pageRepo)
		ipage.NewHandler(pageSvc, cfgSvc, userSvc, hub).Mount(api, imw.JWTAuthMiddleware, imw.OptionalJWTAuthMiddleware)

		dsRepo := ids.NewRepository(db)
		dsSvc := ids.NewService(dsRepo)
		ids.NewHandler(dsSvc, userSvc).Mount(api, imw.JWTAuthMiddleware)

		csRepo := ics.NewRepository(db)
		csSvc := ics.NewService(csRepo)
		ics.NewHandler(csSvc, userSvc).Mount(api, imw.JWTAuthMiddleware)

		// Grengo multi-tenant management API.
		grengoAPI := os.Getenv("GRENGO_API_URL")
		if grengoAPI != "" {
			grengoSvc := igrengo.NewService(grengoAPI)
			igrengo.NewHandler(grengoSvc).Mount(api, imw.JWTAuthMiddleware)
		}
	})

	// ── SSR: serve index.html with injected SEO head tags ──────────────
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		ssrHandler := ssr.IndexHandler(cfgSvc)
		ssrHandler(w, req)
	})

	// ── SPA fallback ───────────────────────────────────────────────────
	// API routes and /uploads/* above take precedence.  If a static file
	// exists on disk we serve it; extensionless paths get the SSR index
	// (client-side routing).  Paths with a file extension that don't exist
	// on disk get a proper 404.
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
		if ext != "" {
			http.NotFound(w, req)
			return
		}

		ssrHandler := ssr.IndexHandler(cfgSvc)
		ssrHandler(w, req)
	})

	return r
}
