package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/httprate"
)

func CommentSlowMode(getConfig func() (bool, time.Duration)) func(http.Handler) http.Handler {
	if getConfig == nil {
		return func(next http.Handler) http.Handler {
			return next
		}
	}

	var mu sync.Mutex
	interval := time.Duration(envIntDefault("COMMENT_SLOWMODE_SECONDS", 10)) * time.Second
	counter := httprate.NewLocalLimitCounter(interval)
	var limiter *httprate.RateLimiter
	lastChecked := time.Time{}
	enabled := false

	createLimiter := func(interval time.Duration) {
		counter.Config(1, interval)
		limiter = httprate.NewRateLimiter(1, interval,
			httprate.WithKeyFuncs(KeyByClientID),
			httprate.WithLimitCounter(counter),
			httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
				writeRateLimitJSON(w, "comment slowmode active — please wait before another comment action", http.StatusTooManyRequests, int(interval.Seconds()))
			}),
		)
	}
	createLimiter(interval)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			if time.Since(lastChecked) > 2*time.Second {
				lastChecked = time.Now()
				cfgEnabled, cfgInterval := getConfig()
				if !cfgEnabled {
					enabled = false
				} else {
					interval = cfgInterval
					if interval < time.Second {
						interval = 10 * time.Second
					}
					enabled = true
					createLimiter(interval)
				}
			}
			mu.Unlock()

			if !enabled {
				next.ServeHTTP(w, r)
				return
			}

			limiter.Handler(next).ServeHTTP(w, r)
		})
	}
}
