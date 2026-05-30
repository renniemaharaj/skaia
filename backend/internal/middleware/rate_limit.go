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
	ijwt "github.com/skaia/backend/internal/jwt"
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
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				if claims, err := ijwt.ValidateToken(parts[1]); err == nil {
					userID = claims.UserID
					ok = true
				}
			}
		}
	}
	if ok {
		_, enabled, _ := authSvc.GetTOTPEnabled(r.Context(), userID)
		if enabled {
			_ = authSvc.SetMFARequired(r.Context(), userID, true)
		}
	}
}

func RateLimitByIP(authSvc *auth.Service) func(http.Handler) http.Handler {
	limit := envIntDefault("API_RATE_LIMIT_IP", 100)
	penaltyDuration := time.Duration(envIntDefault("API_RATE_LIMIT_PENALTY_SECONDS", 15)) * time.Second

	rateLimiter := httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(httprate.KeyByRealIP),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := httprate.KeyByRealIP(r)
			ipPenalty.penalize(key, penaltyDuration)
			triggerMFA(r, authSvc)
			writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, _ := httprate.KeyByRealIP(r)
			if rem, active := ipPenalty.check(key); active {
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

	rateLimiter := httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(KeyByClientID),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := KeyByClientID(r)
			clientPenalty.penalize(key, penaltyDuration)
			writeRateLimitJSON(w, "rate limit exceeded", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, _ := KeyByClientID(r)
			if rem, active := clientPenalty.check(key); active {
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
