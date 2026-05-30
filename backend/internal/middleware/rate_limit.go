package middleware

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/httprate"
	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/internal/utils"
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

func triggerMFA(r *http.Request, authSvc *auth.Service) {
	if authSvc == nil {
		return
	}
	if userID, ok := utils.UserIDFromCtx(r); ok {
		_, enabled, _ := authSvc.GetTOTPEnabled(r.Context(), userID)
		if enabled {
			// Do not block rate limiter on DB write
			go func() {
				_ = authSvc.SetMFARequired(context.Background(), userID, true)
			}()
		}
	}
}

func RateLimitByIP(authSvc *auth.Service) func(http.Handler) http.Handler {
	limit := envIntDefault("API_RATE_LIMIT_IP", 100)
	penaltyDuration := time.Duration(envIntDefault("API_RATE_LIMIT_PENALTY_SECONDS", 15)) * time.Second
	pb := newPenaltyBox()

	rateLimiter := httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(httprate.KeyByRealIP),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := httprate.KeyByRealIP(r)
			pb.penalize(key, penaltyDuration)
			triggerMFA(r, authSvc)
			writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, _ := httprate.KeyByRealIP(r)
			if rem, active := pb.check(key); active {
				triggerMFA(r, authSvc)
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
