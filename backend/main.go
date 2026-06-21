package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	log "github.com/skaia/backend/internal/syslog"
	"net/http"
	"net/http/httputil"
	"net/url"
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
	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/database"
	ianalytics "github.com/skaia/backend/internal/analytics"
	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/internal/authhandler"
	icfg "github.com/skaia/backend/internal/config"
	"github.com/skaia/backend/internal/ctx"
	ics "github.com/skaia/backend/internal/customsection"
	ids "github.com/skaia/backend/internal/datasource"
	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	iforum "github.com/skaia/backend/internal/forum"
	igrengo "github.com/skaia/backend/internal/grengo"
	iinbox "github.com/skaia/backend/internal/inbox"
	ijwt "github.com/skaia/backend/internal/jwt"
	immediascraper "github.com/skaia/backend/internal/mediascraper"
	imw "github.com/skaia/backend/internal/middleware"
	inotif "github.com/skaia/backend/internal/notification"
	ipage "github.com/skaia/backend/internal/page"
	"github.com/skaia/backend/internal/ssr"
	istore "github.com/skaia/backend/internal/store"
	iupload "github.com/skaia/backend/internal/upload"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	defconmw "github.com/skaia/backend/middleware"
	"github.com/skaia/backend/ratelimit"
	"github.com/renniemaharaj/conveyor/pkg/conveyor"
	iprovisioning "github.com/skaia/backend/internal/provisioning"
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

	if err := seedAdminPassword(database.DB); err != nil {
		log.Printf("admin seed: %v", err)
	}

	hub := ws.NewHub()
	hub.SetDB(database.DB)
	go hub.Run()

	dispatcher := ievents.NewDispatcher(database.DB)
	dispatcher.OnPersist = func(event map[string]interface{}) {
		hub.BroadcastEvent(event)
	}
	dispatcher.Start()

	rdb := database.NewRedisClient()
	dsCompileCache := ids.NewCompileCacheWithClient(rdb)
	dsExecuteCache := ids.NewExecuteCacheWithClient(rdb)
	dsCompileDispatcher := ids.NewCompileDispatcher(dsCompileCache, dispatcher)
	dsExecuteDispatcher := ids.NewExecuteDispatcher(dsExecuteCache, dispatcher)
	dsCompileDispatcher.Start()
	dsExecuteDispatcher.Start()

	conveyorManager := conveyor.CreateManager()
	conveyorManager.Start()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ratelimit.InitCloudflare()

	baseHandler := buildRouter(database.DB, hub, dispatcher, rdb, dsCompileCache, dsExecuteCache, dsCompileDispatcher, dsExecuteDispatcher, conveyorManager)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           baseHandler,
		ReadTimeout:       time.Duration(envInt("HTTP_READ_TIMEOUT_SEC", 3600)) * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      time.Duration(envInt("HTTP_WRITE_TIMEOUT_SEC", 3600)) * time.Second,
		IdleTimeout:       time.Duration(envInt("HTTP_IDLE_TIMEOUT_SEC", 120)) * time.Second,
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
	dsCompileDispatcher.Stop()
	dsExecuteDispatcher.Stop()
	dispatcher.Stop()
	conveyorManager.Stop()
	log.Println("server stopped")
}

func seedAdminPassword(db *sql.DB) error {
	pw := os.Getenv("ADMIN_PASSWORD")
	if pw == "" {
		log.Println("ADMIN_PASSWORD not set, skipping admin seed")
		return nil
	}
	email := os.Getenv("ADMIN_EMAIL")

	return database.NewTransactor(db).Transactional(context.Background(), func(ctx context.Context) error {
		exec := database.ExecutorFromContext(ctx, db)

		var adminID int64
		err := exec.QueryRowContext(ctx, `SELECT id FROM users WHERE username = 'admin'`).Scan(&adminID)
		if err != nil {
			return fmt.Errorf("could not find admin user: %w", err)
		}

		if email != "" {
			if _, err := exec.ExecContext(ctx, `UPDATE users SET email = $1 WHERE id = $2`, email, adminID); err != nil {
				return fmt.Errorf("failed to update admin email: %w", err)
			}
		}

		repo := auth.NewSQLRepository(db)
		if _, err = repo.GetCredentialByUserID(ctx, adminID); err == nil {
			passwordHash, err := auth.BcryptPassword(pw)
			if err != nil {
				return fmt.Errorf("failed to hash admin password: %w", err)
			}
			if err := repo.UpdatePasswordHash(ctx, adminID, passwordHash); err != nil {
				return fmt.Errorf("failed to update admin password hash: %w", err)
			}
			log.Println("admin seed: password updated in auth_credentials")
			return nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("failed to inspect admin credential: %w", err)
		}

		authSvc := auth.NewService(repo, nil)
		if _, err := authSvc.RegisterCredential(ctx, adminID, pw); err != nil {
			return fmt.Errorf("failed to create admin credential: %w", err)
		}
		log.Println("admin seed: password created in auth_credentials")
		return nil
	})
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

func buildRouter(db *sql.DB, hub *ws.Hub, dispatcher *ievents.Dispatcher, rdb *redis.Client, dsCompileCache *ids.CompileCache, dsExecuteCache *ids.ExecuteCache, dsCompileDispatcher *ids.CompileDispatcher, dsExecuteDispatcher *ids.ExecuteDispatcher, conveyorManager *conveyor.Manager) http.Handler {
	userRepo := iuser.NewRepository(db)
	userCache := iuser.NewCacheWithClient(rdb)
	userSvc := iuser.NewService(userRepo, userCache)

	authRepo := auth.NewSQLRepository(db)
	authSvc := auth.NewService(authRepo, userSvc)

	forumCatRepo := iforum.NewCategoryRepository(db)
	forumThreadRepo := iforum.NewThreadRepository(db)
	forumCommentRepo := iforum.NewCommentRepository(db)
	forumCache := iforum.NewThreadCacheWithClient(rdb)
	forumSvc := iforum.NewService(forumCatRepo, forumThreadRepo, forumCommentRepo, forumCache)

	emailSender := iemail.NewSenderFromEnv()

	inboxRepo := iinbox.NewRepository(db)
	inboxSvc := iinbox.NewService(inboxRepo, hub, userRepo)

	inboxSender := iinbox.NewInboxSender(inboxSvc)

	storeCatRepo := istore.NewCategoryRepository(db)
	storeProdRepo := istore.NewProductRepository(db)
	storeCartRepo := istore.NewCartRepository(db)
	storeOrdRepo := istore.NewOrderRepository(db)
	storeRefRepo := istore.NewReferenceCodeRepository(db)
	storePayRepo := istore.NewPaymentRepository(db)
	storePlanRepo := istore.NewSubscriptionPlanRepository(db)
	storeSubRepo := istore.NewSubscriptionRepository(db)
	storeReviewRepo := istore.NewReviewRepository(db)
	storeWalletRepo := istore.NewWalletRepository(db)
	storeCache := istore.NewProductCacheWithClient(rdb)
	storeProv := istore.NewPaymentProvider()
	storeSvc := istore.NewService(storeCatRepo, storeProdRepo, storeCartRepo, storeOrdRepo, storeRefRepo, storePayRepo, storePlanRepo, storeSubRepo, storeReviewRepo, storeWalletRepo, storeCache, storeProv, userSvc, inboxSender)

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

	// Intercept *.frappe.localhost and proxy directly to Frappe cluster
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if strings.HasSuffix(req.Host, ".frappe.localhost") {
				targetURL, _ := url.Parse("http://host.docker.internal:8000")
				proxy := httputil.NewSingleHostReverseProxy(targetURL)
				proxy.ServeHTTP(w, req)
				return
			}
			next.ServeHTTP(w, req)
		})
	})
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
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-TOTP-Code"},
		ExposedHeaders:   []string{},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Note: We don't apply the rate limiter globally here because doing so would
	// block the React frontend from loading its HTML/JS/CSS assets during a jail
	// sentence, completely locking the user out of the TOTP bypass UI.
	defconLimiter := defconmw.DEFCONRateLimit(rdb, userSvc, authSvc)

	// Health check at root (for Docker healthcheck probes)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{Message: "Skaia API is healthy", Status: "ok"})
	})

	// Sitemap for SEO (per-client and default)
	r.Get("/sitemap.xml", writeSitemapResponse)
	r.Get("/sitemap/{client}.xml", writeSitemapResponse)

	// WebSocket at root (nginx proxies /ws directly)
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		defconLimiter(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ws.HandleConnection(w, r, hub)
		})).ServeHTTP(w, r)
	})

	//  Static file serving for user uploads (at root - URLs are stored
	// in the DB as /uploads/users/…)
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

	hub.MentionProcessor = func(content string, senderID int64, message string, route string) {
		mentions := utils.ExtractMentions(content)
		if len(mentions) > 0 {
			notifSvc.ProcessMentions(mentions, senderID, message, route)
		}
	}

	cfgRepo := icfg.NewRepository(db)
	cfgSvc := icfg.NewService(cfgRepo)

	// Bootstrap hub chat slow-mode from the persisted config so it takes
	// effect on the first connection rather than waiting for the next toggle.
	if sc, err := cfgSvc.GetConfig("comment_slowmode"); err == nil && sc != nil {
		var sm struct {
			Enabled  bool `json:"enabled"`
			Interval int  `json:"interval"`
		}
		if json.Unmarshal([]byte(sc.Value), &sm) == nil {
			hub.SetChatSlowMode(sm.Enabled, sm.Interval)
		}
	}

	// All API routes under /api
	r.Route("/api", func(api chi.Router) {
		armedDir := os.Getenv("ARMED_DIR")
		if armedDir == "" {
			armedDir = "armed"
		}
		api.Use(imw.ArmedMiddleware(armedDir, []string{"/api/arm", "/api/disarm", "/api/site/arm", "/api/site/disarm", "/api/health", "/api/time", "/api/armed-status", "/api/auth/login", "/api/auth/refresh", "/api/grengo/"}))
		api.Use(defconLimiter, imw.ExtractTokenMiddleware, imw.IPHoppingMiddleware(authSvc), imw.MFARequiredMiddleware(authSvc))

		api.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(SimpleResponse{Message: "Skaia API is healthy", Status: "ok"})
		})

		api.Get("/defcon/telemetry", func(w http.ResponseWriter, r *http.Request) {
			stats := ratelimit.GetLatestStats()
			if stats == nil {
				http.Error(w, `{"error":"telemetry uninitialized"}`, http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(stats)
		})

		api.Post("/defcon/reset", func(w http.ResponseWriter, r *http.Request) {
			userID, ok := utils.UserIDFromCtx(r)
			if !ok {
				utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			allowed, _ := userSvc.HasPermission(userID, "admin.general")
			if !allowed {
				utils.WriteError(w, http.StatusForbidden, "forbidden")
				return
			}
			if err := ratelimit.ResetDEFCON(r.Context(), rdb); err != nil {
				utils.WriteError(w, http.StatusInternalServerError, "failed to reset DEFCON telemetry")
				return
			}
			_ = ratelimit.PromoteToTrusted(r.Context(), rdb, defconmw.RealIP(r))
			stats, _ := ratelimit.RefreshTelemetry(r.Context(), rdb)
			if stats != nil {
				b, _ := json.Marshal(stats)
				hub.BroadcastToPermission("admin.general", &ws.Message{
					Type:    "defcon:telemetry",
					Payload: b,
				})
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "stats": stats})
		})

		go ratelimit.WatchTelemetry(context.Background(), rdb, func(stats ratelimit.TelemetryStats) {
			b, _ := json.Marshal(stats)
			hub.BroadcastToPermission("admin.general", &ws.Message{
				Type:    "defcon:telemetry",
				Payload: b,
			})
		})

		api.Post("/auth/bypass-rate-limit", func(w http.ResponseWriter, r *http.Request) {
			userID, ok := utils.UserIDFromCtx(r)
			if !ok {
				utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			powerLevel, err := userSvc.GetUserMaxPowerLevel(userID)
			if err != nil || powerLevel <= 10 {
				utils.WriteError(w, http.StatusForbidden, "priority access unavailable")
				return
			}
			_, enabled, err := authSvc.GetTOTPEnabled(r.Context(), userID)
			if err != nil || !enabled {
				utils.WriteError(w, http.StatusForbidden, "priority access requires MFA")
				return
			}
			totpCode := r.Header.Get("X-TOTP-Code")
			valid, _ := authSvc.VerifyTOTP(r.Context(), userID, totpCode)
			if !valid {
				utils.WriteError(w, http.StatusForbidden, "invalid priority access code")
				return
			}
			_ = ratelimit.GrantUserBypass(r.Context(), rdb, userID)
			_ = ratelimit.PromoteToTrusted(r.Context(), rdb, defconmw.RealIP(r))
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(SimpleResponse{Message: "Rate limit bypass verified", Status: "ok"})
		})

		api.Get("/armed-status", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]bool{"armed": imw.IsArmed(armedDir)})
		})

		api.Route("/site", func(site chi.Router) {
			site.Use(imw.JWTAuthMiddleware, imw.PermissionMiddleware("home.manage"))

			site.Post("/arm", func(w http.ResponseWriter, r *http.Request) {
				claims, ok := r.Context().Value(ctx.CtxKeyClaims).(*ijwt.Claims)
				if !ok || claims == nil {
					http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
					return
				}

				powerLevel, err := userSvc.GetUserMaxPowerLevel(claims.UserID)
				if err != nil {
					http.Error(w, `{"error":"failed to validate power level"}`, http.StatusInternalServerError)
					return
				}
				if powerLevel <= 50 {
					http.Error(w, `{"error":"insufficient power level"}`, http.StatusForbidden)
					return
				}

				if err := writeArmedFile(armedDir, "site-admin"); err != nil {
					http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
					return
				}

				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(SimpleResponse{Message: "site armed", Status: "ok"})
			})

			site.Post("/disarm", func(w http.ResponseWriter, r *http.Request) {
				claims, ok := r.Context().Value(ctx.CtxKeyClaims).(*ijwt.Claims)
				if !ok || claims == nil {
					http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
					return
				}

				powerLevel, err := userSvc.GetUserMaxPowerLevel(claims.UserID)
				if err != nil {
					http.Error(w, `{"error":"failed to validate power level"}`, http.StatusInternalServerError)
					return
				}
				if powerLevel <= 50 {
					http.Error(w, `{"error":"insufficient power level"}`, http.StatusForbidden)
					return
				}

				if err := removeArmedFile(armedDir, "site-admin"); err != nil {
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
				json.NewEncoder(w).Encode(SimpleResponse{Message: "site disarmed", Status: "ok"})
			})
		})

		api.Post("/arm", func(w http.ResponseWriter, r *http.Request) {
			clientID, err := validateArmHeaders(r)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusUnauthorized)
				return
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

		api.Get("/internal/storage", iupload.HandleInternalStorage)

		api.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
			ws.HandleConnection(w, r, hub)
		})

		commentSlowMode := imw.CommentSlowMode(func() (bool, time.Duration) {
			sc, err := cfgSvc.GetConfig("comment_slowmode")
			if err != nil || sc == nil {
				return false, 0
			}
			var payload struct {
				Enabled  bool `json:"enabled"`
				Interval int  `json:"interval"`
			}
			if err := json.Unmarshal([]byte(sc.Value), &payload); err != nil {
				return false, 0
			}
			if !payload.Enabled {
				return false, 0
			}
			if payload.Interval < 1 {
				payload.Interval = 10
			}
			return true, time.Duration(payload.Interval) * time.Second
		})

		analyticsRepo := ianalytics.NewRepository(db)
		analyticsSvc := ianalytics.NewService(analyticsRepo)

		authHandler := auth.NewHandler(authSvc, hub, dispatcher, emailSender, inboxSvc, userSvc)
		hub.OnGuestSessionClosed = authHandler.ExpireRecoveryRequestsForGuestSession
		authhandler.NewHandler(authHandler).Mount(api, imw.JWTAuthMiddleware)
		iuser.NewHandler(userSvc, hub, dispatcher, inboxSender, emailSender).Mount(api, imw.JWTAuthMiddleware)
		iforum.NewHandler(forumSvc, hub, notifSvc, userSvc, dispatcher, analyticsSvc).Mount(api, imw.JWTAuthMiddleware, commentSlowMode)
		istore.NewHandler(storeSvc, hub, notifSvc, userSvc, dispatcher).Mount(api, imw.JWTAuthMiddleware)

		uploadHandler := iupload.NewHandler(hub)
		uploadHandler.Mount(api, imw.JWTAuthMiddleware)
		iupload.MountUserUploads(api, imw.JWTAuthMiddleware, userSvc, hub)

		inotif.NewHandler(notifSvc, hub).Mount(api, imw.JWTAuthMiddleware)

		iinbox.NewHandler(inboxSvc, dispatcher).Mount(api, imw.JWTAuthMiddleware)

		icfg.NewHandler(cfgSvc, userSvc, hub, dispatcher).Mount(api, imw.JWTAuthMiddleware)

		dsRepo := ids.NewRepository(db)
		dsSvc := ids.NewService(dsRepo)
		dsHandler := ids.NewHandler(dsSvc, userSvc, dsCompileCache, dsCompileDispatcher, dsExecuteCache, dsExecuteDispatcher)
		dsHandler.Mount(api, imw.JWTAuthMiddleware, imw.CompileRateLimitByIP(), imw.CompileRateLimitByClient())

		csRepo := ics.NewRepository(db)
		csSvc := ics.NewService(csRepo)
		ics.NewHandler(csSvc, userSvc).Mount(api, imw.JWTAuthMiddleware)

		pageRepo := ipage.NewRepository(db)
		pageSvc := ipage.NewService(pageRepo, inboxSvc, ipage.WithIntegrationResolvers(dsSvc, csSvc), ipage.WithRedisClient(rdb))
		ipage.NewHandler(pageSvc, cfgSvc, userSvc, hub, dispatcher, analyticsSvc).Mount(api, imw.JWTAuthMiddleware, commentSlowMode)

		// Events log admin API.
		eventsRepo := ievents.NewRepository(db)
		ievents.NewHandler(eventsRepo, userSvc).Mount(api, imw.JWTAuthMiddleware)

		// Analytics API.
		ianalytics.NewHandler(analyticsSvc).Mount(api, imw.JWTAuthMiddleware)

		// Grengo multi-tenant management API.
		grengoAPI := os.Getenv("GRENGO_API_URL")
		var grengoSvc *igrengo.Service
		if grengoAPI != "" {
			grengoSvc = igrengo.NewService(grengoAPI, hub)
			if pcode := os.Getenv("GRENGO_API_PASSCODE"); pcode != "" {
				parts := strings.SplitN(pcode, ":", 2)
				if len(parts) == 2 {
					grengoSvc = grengoSvc.WithPasscode(parts[0], parts[1])
				}
			}
			hub.GrengoActionHandler = grengoSvc.SendAction
			go grengoSvc.WatchJobs()
			igrengo.NewHandler(grengoSvc).Mount(api, imw.JWTAuthMiddleware)
		}

		immediascraper.SetHub(hub)
		immediascraper.NewHandler(userSvc).Mount(api, imw.JWTAuthMiddleware)

		provRepo := iprovisioning.NewRepository(db)
		provSvc := iprovisioning.NewService(provRepo, conveyorManager, hub, grengoSvc)
		iprovisioning.NewHandler(provSvc).Mount(api, imw.JWTAuthMiddleware)
	})



	// SSR: serve index.html with injected SEO head tags
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		ssrHandler := ssr.IndexHandler(cfgSvc, rdb, database.DB)
		imw.ExtractTokenMiddleware(ssrHandler).ServeHTTP(w, req)
	})

	// Proxy /instances/{id} to the corresponding container (or redirect Frappe)
	r.Handle("/instances/{id}", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		req.URL.Path = req.URL.Path + "/"
		http.Redirect(w, req, req.URL.Path, http.StatusMovedPermanently)
	}))

	r.Handle("/instances/{id}/*", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		idStr := chi.URLParam(req, "id")
		var id int64
		fmt.Sscanf(idStr, "%d", &id)

		inst, err := iprovisioning.NewRepository(database.DB).GetInstanceByID(id)
		if err != nil || inst == nil {
			http.Error(w, "Instance not found", http.StatusNotFound)
			return
		}

		var configMap map[string]interface{}
		json.Unmarshal(inst.ConfigPayload, &configMap)

		siteName, _ := configMap["site_name"].(string)
		portRaw := configMap["port"]
		var targetPort float64
		if portRaw != nil {
			targetPort, _ = portRaw.(float64)
		} else {
			targetPort = 8000
		}

		bp, _ := iprovisioning.NewRepository(database.DB).GetBlueprintByID(inst.BlueprintID)
		isFrappe := true
		if bp != nil {
			if bp.Name == "Superset" || bp.Name == "superset" || bp.Name == "Apache Superset" {
				isFrappe = false
			}
		}

		if isFrappe {
			if siteName == "" {
				siteName = fmt.Sprintf("site%d.frappe.localhost", id)
			}
			// Frappe does not support sub-path proxying. Redirect to the subdomain.
			scheme := "http"
			if req.TLS != nil || req.Header.Get("X-Forwarded-Proto") == "https" {
				scheme = "https"
			}
			redirectURL := fmt.Sprintf("%s://%s/", scheme, siteName)
			http.Redirect(w, req, redirectURL, http.StatusMovedPermanently)
			return
		}

		targetURL, _ := url.Parse(fmt.Sprintf("http://host.docker.internal:%d", int(targetPort)))
		log.Printf("[DEBUG] Proxying to non-Frappe instance: targetPort=%v, targetURL=%v", targetPort, targetURL)

		proxy := httputil.NewSingleHostReverseProxy(targetURL)
		
		// Remove the /instances/{id} prefix
		prefix := fmt.Sprintf("/instances/%d", id)
		req.URL.Path = strings.TrimPrefix(req.URL.Path, prefix)
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}

		proxy.ServeHTTP(w, req)
	}))

	// SPA fallback
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

		ssrHandler := ssr.IndexHandler(cfgSvc, rdb, database.DB)
		imw.ExtractTokenMiddleware(ssrHandler).ServeHTTP(w, req)
	})

	return r
}
