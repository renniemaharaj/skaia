package middleware

import (
	"math"
	"net/http"
	"time"

	"github.com/go-chi/httprate"
)

// AuthLimitMiddleware applies 10 req/min per client (or IP fallback) for auth endpoints.
// Once triggered, the client is locked out for the full penalty period.
func AuthLimitMiddleware() func(http.Handler) http.Handler {
	penaltyDuration := time.Duration(envIntDefault("AUTH_RATE_LIMIT_PENALTY_SECONDS", 15)) * time.Second

	rateLimiter := httprate.Limit(10, time.Minute,
		httprate.WithKeyFuncs(KeyByClientID),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := KeyByClientID(r)
			authPenalty.penalize(key, penaltyDuration)
			writeRateLimitJSON(w, "too many auth attempts", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, _ := KeyByClientID(r)
			if rem, active := authPenalty.check(key); active {
				writeRateLimitJSON(w, "too many auth attempts", http.StatusTooManyRequests, int(math.Ceil(rem.Seconds())))
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}
