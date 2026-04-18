package middleware

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/httprate"
	"github.com/skaia/backend/internal/auth"
)

// JWTAuthMiddleware validates the Bearer token in the Authorization header.
func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, `{"error":"invalid authorization header"}`, http.StatusUnauthorized)
			return
		}

		claims, err := auth.ValidateToken(parts[1])
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), auth.CtxKeyClaims, claims)
		ctx = context.WithValue(ctx, auth.CtxKeyUserID, claims.UserID)
		ctx = context.WithValue(ctx, auth.CtxKeyUserRoles, claims.Roles)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// OptionalJWTAuthMiddleware enriches context when a valid Bearer token
// is present but passes unauthenticated requests through.
func OptionalJWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				if claims, err := auth.ValidateToken(parts[1]); err == nil {
					ctx := context.WithValue(r.Context(), auth.CtxKeyClaims, claims)
					ctx = context.WithValue(ctx, auth.CtxKeyUserID, claims.UserID)
					ctx = context.WithValue(ctx, auth.CtxKeyUserRoles, claims.Roles)
					r = r.WithContext(ctx)
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

// PermissionMiddleware checks that the user holds a permission or the admin role.
func PermissionMiddleware(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(auth.CtxKeyClaims).(*auth.Claims)
			if !ok || claims == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			for _, role := range claims.Roles {
				if role == "admin" {
					next.ServeHTTP(w, r)
					return
				}
			}

			for _, perm := range claims.Permissions {
				if perm == permission {
					next.ServeHTTP(w, r)
					return
				}
			}

			http.Error(w, `{"error":"insufficient permissions"}`, http.StatusForbidden)
		})
	}
}

// RateLimitMiddleware applies 100 req/min per IP.
func RateLimitMiddleware() func(http.Handler) http.Handler {
	return httprate.Limit(100, time.Minute,
		httprate.WithKeyByIP(),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
		}),
	)
}

// AuthLimitMiddleware applies 10 req/min per client (or IP fallback) for auth endpoints.
func AuthLimitMiddleware() func(http.Handler) http.Handler {
	return httprate.Limit(10, time.Minute,
		httprate.WithKeyFuncs(KeyByClientID),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"too many auth attempts"}`, http.StatusTooManyRequests)
		}),
	)
}

func RateLimitByIP() func(http.Handler) http.Handler {
	limit := envIntDefault("API_RATE_LIMIT_IP", 100)
	return httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(httprate.KeyByRealIP),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
		}),
	)
}

func RateLimitByClient() func(http.Handler) http.Handler {
	limit := envIntDefault("API_RATE_LIMIT_CLIENT", 200)
	return httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(KeyByClientID),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
		}),
	)
}

func envIntDefault(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func KeyByClientID(r *http.Request) (string, error) {
	clientID := strings.TrimSpace(r.Header.Get("X-Client-ID"))
	if clientID != "" {
		return clientID, nil
	}
	ip, err := httprate.KeyByRealIP(r)
	if err != nil {
		return "", err
	}
	return "anon:" + ip, nil
}

func CompileRateLimitByIP() func(http.Handler) http.Handler {
	limit := envIntDefault("COMPILER_RATE_LIMIT_IP", 20)
	return httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(httprate.KeyByRealIP),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"compiler rate limit exceeded"}`, http.StatusTooManyRequests)
		}),
	)
}

func CompileRateLimitByClient() func(http.Handler) http.Handler {
	limit := envIntDefault("COMPILER_RATE_LIMIT_CLIENT", 60)
	return httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(KeyByClientID),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error":"compiler client rate limit exceeded"}`, http.StatusTooManyRequests)
		}),
	)
}

// IsArmed checks whether any armed file exists in the given directory.
func IsArmed(armedDir string) bool {
	entries, err := os.ReadDir(armedDir)
	if err != nil {
		if os.IsNotExist(err) {
			return false
		}
		// Fail safe: do not block on read errors, but log.
		log.Printf("armed middleware: cannot read dir %q: %v", armedDir, err)
		return false
	}
	for _, e := range entries {
		if !e.IsDir() {
			return true
		}
	}
	return false
}

// ArmedMiddleware rejects API requests when the backend has been armed.
// It allows whitelisted paths to continue even while armed (e.g. arm/disarm and health probes).
// Paths ending in "/" are treated as prefixes.
func ArmedMiddleware(armedDir string, allowPaths []string) func(http.Handler) http.Handler {
	exact := map[string]struct{}{}
	var prefixes []string
	for _, p := range allowPaths {
		if strings.HasSuffix(p, "/") {
			prefixes = append(prefixes, p)
		} else {
			exact[p] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// bypass if this exact path is allowed
			if _, ok := exact[r.URL.Path]; ok {
				next.ServeHTTP(w, r)
				return
			}
			// bypass if path matches an allowed prefix
			for _, pfx := range prefixes {
				if strings.HasPrefix(r.URL.Path, pfx) {
					next.ServeHTTP(w, r)
					return
				}
			}

			if IsArmed(armedDir) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte(`{"error":"service is armed"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
