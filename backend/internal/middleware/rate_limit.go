package middleware

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/httprate"
	"github.com/skaia/backend/internal/auth"
)

// RateLimitMiddleware applies 100 req/min per IP.
func RateLimitMiddleware() func(http.Handler) http.Handler {
	return httprate.Limit(100, time.Minute,
		httprate.WithKeyByIP(),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, 15)
		}),
	)
}

func RateLimitByIP(authSvc *auth.Service) func(http.Handler) http.Handler {
	_ = authSvc
	limit := envIntDefault("API_RATE_LIMIT_IP", 100)
	penaltyDuration := time.Duration(envIntDefault("API_RATE_LIMIT_PENALTY_SECONDS", 15)) * time.Second
	pb := newPenaltyBox()

	rateLimiter := httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(httprate.KeyByRealIP),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := httprate.KeyByRealIP(r)
			pb.penalize(key, penaltyDuration)
			writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/upload/chunked/") {
				next.ServeHTTP(w, r)
				return
			}
			key, _ := httprate.KeyByRealIP(r)
			if rem, active := pb.check(key); active {
				writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, int(math.Ceil(rem.Seconds())))
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}

func RateLimitByClient() func(http.Handler) http.Handler {
	limit := envIntDefault("API_RATE_LIMIT_CLIENT", 200)
	penaltyDuration := time.Duration(envIntDefault("API_RATE_LIMIT_PENALTY_SECONDS", 15)) * time.Second
	pb := newPenaltyBox()

	rateLimiter := httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(KeyByClientID),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := KeyByClientID(r)
			pb.penalize(key, penaltyDuration)
			writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/upload/chunked/") {
				next.ServeHTTP(w, r)
				return
			}
			key, _ := KeyByClientID(r)
			if rem, active := pb.check(key); active {
				writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, int(math.Ceil(rem.Seconds())))
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}

func writeRateLimitJSON(w http.ResponseWriter, message string, status int, retryAfter int) {
	w.Header().Set("Content-Type", "application/json")
	if retryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":       message,
		"retry_after": retryAfter,
	})
}
