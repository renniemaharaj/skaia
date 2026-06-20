package middleware

import (
	log "github.com/skaia/backend/internal/syslog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	armedCache struct {
		mu          sync.RWMutex
		isArmed     bool
		lastChecked time.Time
	}
)

// IsArmed checks whether any armed file exists in the given directory.
// It caches the result for 2 seconds to avoid excessive disk I/O.
func IsArmed(armedDir string) bool {
	armedCache.mu.RLock()
	if time.Since(armedCache.lastChecked) < 2*time.Second {
		armed := armedCache.isArmed
		armedCache.mu.RUnlock()
		return armed
	}
	armedCache.mu.RUnlock()

	armedCache.mu.Lock()
	defer armedCache.mu.Unlock()
	if time.Since(armedCache.lastChecked) < 2*time.Second {
		return armedCache.isArmed
	}

	armedCache.lastChecked = time.Now()

	entries, err := os.ReadDir(armedDir)
	if err != nil {
		if os.IsNotExist(err) {
			armedCache.isArmed = false
			return false
		}
		// Fail safe: do not block on read errors, but log.
		log.Printf("armed middleware: cannot read dir %q: %v", armedDir, err)
		armedCache.isArmed = false
		return false
	}
	for _, e := range entries {
		if !e.IsDir() {
			armedCache.isArmed = true
			return true
		}
	}
	armedCache.isArmed = false
	return false
}

// ResetArmedCacheForTest is used in tests to clear the armed cache
func ResetArmedCacheForTest() {
	armedCache.mu.Lock()
	armedCache.lastChecked = time.Time{}
	armedCache.mu.Unlock()
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
