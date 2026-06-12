package middleware

import (
	"net"
	"net/http"
	"strconv"
	"time"

	"log/slog"

	"github.com/redis/go-redis/v9"

	"github.com/skaia/backend/ratelimit" // replace with your actual Go module path
)

// DEFCONRateLimit returns an http.Handler middleware that enforces adaptive
// three-tier rate limiting using Redis.
//
// Drop it into any standard net/http chain:
//
//	mux := http.NewServeMux()
//	mux.Handle("/", middleware.DEFCONRateLimit(rdb)(yourHandler))
//
// Or wrap your entire router:
//
//	http.ListenAndServe(":8080", middleware.DEFCONRateLimit(rdb)(mux))
func DEFCONRateLimit(rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ip := realIP(r)

			//  Step 1: Jail check
			// Fastest path — a jailed IP gets a 429 after a single Redis GET.
			jailed, err := ratelimit.IsJailed(ctx, rdb, ip)
			if err != nil {
				slog.Error("jail check failed", "ip", ip, "err", err)
				// Fail open — don't block legitimate users on a Redis error.
			}
			if jailed {
				retryAfter := ratelimit.WindowRemaining(ctx, rdb, ip)
				writeTooManyRequests(w, retryAfter)
				return
			}

			//  Step 2: Trusted citizen check
			// Trusted IPs bypass the adaptive formula but still have a ceiling.
			trusted, err := ratelimit.IsTrusted(ctx, rdb, ip)
			if err != nil {
				slog.Error("trusted check failed", "ip", ip, "err", err)
			}
			if trusted {
				over, err := ratelimit.CheckTrustedLimit(ctx, rdb, ip)
				if err != nil {
					slog.Error("trusted limit check failed", "ip", ip, "err", err)
				}
				if over {
					// Trusted IP blew through the hard ceiling — jail it.
					// This catches compromised machines and slow-roll bots.
					count, jailErr := ratelimit.JailIP(ctx, rdb, ip)
					if jailErr != nil {
						slog.Error("jail write failed", "ip", ip, "err", jailErr)
					}
					ratelimit.PushBlockAsync(ip, count)
					writeTooManyRequests(w, time.Minute)
					return
				}
				// Trusted and within ceiling — let through.
				next.ServeHTTP(w, r)
				return
			}

			//  Step 3: Purgatory — adaptive allowance
			allowance, err := ratelimit.AdaptiveAllowance(ctx, rdb)
			if err != nil {
				slog.Error("allowance compute failed", "ip", ip, "err", err)
				// Fail open with base limit.
			}

			count, over, err := ratelimit.CheckAndCount(ctx, rdb, ip, allowance)
			if err != nil {
				slog.Error("counter failed", "ip", ip, "err", err)
			}

			if over {
				// Exceeded adaptive allowance => jail the IP.
				jailedCount, jailErr := ratelimit.JailIP(ctx, rdb, ip)
				if jailErr != nil {
					slog.Error("jail write failed", "ip", ip, "err", jailErr)
				}
				ratelimit.PushBlockAsync(ip, jailedCount)

				slog.Warn("IP jailed",
					"ip", ip,
					"requests_this_window", count,
					"adaptive_allowance", allowance,
					"total_jailed", jailedCount,
				)
				writeTooManyRequests(w, ratelimit.WindowRemaining(ctx, rdb, ip))
				return
			}

			//  Step 4: Graduation check
			// Request was clean — record it and promote if threshold is met.
			graduated, err := ratelimit.RecordCleanRequest(ctx, rdb, ip)
			if err != nil {
				slog.Error("graduation record failed", "ip", ip, "err", err)
			}
			if graduated {
				if promoteErr := ratelimit.PromoteToTrusted(ctx, rdb, ip); promoteErr != nil {
					slog.Error("promotion failed", "ip", ip, "err", promoteErr)
				} else {
					slog.Info("IP graduated to trusted", "ip", ip)
				}
			}

			//  All checks passed — forward the request
			next.ServeHTTP(w, r)
		})
	}
}

//
// Helpers
//

// realIP extracts the true client IP from the request.
// Priority order:
//  1. CF-Connecting-IP  — set by Cloudflare (most trustworthy when behind CF)
//  2. X-Forwarded-For   — set by most load balancers and reverse proxies
//  3. RemoteAddr        — raw TCP connection IP (fallback)
//
// WARNING: Only trust CF-Connecting-IP / X-Forwarded-For if your Go server
// is behind a proxy you control. If it's exposed directly to the internet,
// use RemoteAddr only — these headers are trivially spoofed.
func realIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		// X-Forwarded-For may be a comma-separated list; the leftmost is the client.
		for i := 0; i < len(ip); i++ {
			if ip[i] == ',' {
				return ip[:i]
			}
		}
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// writeTooManyRequests writes a 429 response with standard rate-limit headers.
func writeTooManyRequests(w http.ResponseWriter, retryAfter time.Duration) {
	seconds := int(retryAfter.Seconds())
	if seconds < 1 {
		seconds = 60
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	w.Header().Set("X-RateLimit-Reason", "adaptive-defcon")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_, _ = w.Write([]byte(`{"error":"rate limit exceeded","retry_after":` +
		strconv.Itoa(seconds) + `}`))
}
