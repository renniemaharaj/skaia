package middleware

import (
	"math"
	"net/http"
	"time"

	"github.com/go-chi/httprate"
)

func CompileRateLimitByIP() func(http.Handler) http.Handler {
	limit := envIntDefault("COMPILER_RATE_LIMIT_IP", 20)
	penaltyDuration := time.Duration(envIntDefault("COMPILER_RATE_LIMIT_PENALTY_SECONDS", 15)) * time.Second
	pb := newPenaltyBox()

	rateLimiter := httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(httprate.KeyByRealIP),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := httprate.KeyByRealIP(r)
			pb.penalize(key, penaltyDuration)
			writeRateLimitJSON(w, "compiler rate limit exceeded", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, _ := httprate.KeyByRealIP(r)
			if rem, active := pb.check(key); active {
				writeRateLimitJSON(w, "compiler rate limit exceeded", http.StatusTooManyRequests, int(math.Ceil(rem.Seconds())))
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}

func CompileRateLimitByClient() func(http.Handler) http.Handler {
	limit := envIntDefault("COMPILER_RATE_LIMIT_CLIENT", 60)
	penaltyDuration := time.Duration(envIntDefault("COMPILER_RATE_LIMIT_PENALTY_SECONDS", 15)) * time.Second
	pb := newPenaltyBox()

	rateLimiter := httprate.Limit(limit, time.Minute,
		httprate.WithKeyFuncs(KeyByClientID),
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			key, _ := KeyByClientID(r)
			pb.penalize(key, penaltyDuration)
			writeRateLimitJSON(w, "compiler client rate limit exceeded", http.StatusTooManyRequests, int(penaltyDuration.Seconds()))
		}),
	)

	return func(next http.Handler) http.Handler {
		limited := rateLimiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key, _ := KeyByClientID(r)
			if rem, active := pb.check(key); active {
				writeRateLimitJSON(w, "compiler client rate limit exceeded", http.StatusTooManyRequests, int(math.Ceil(rem.Seconds())))
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}
