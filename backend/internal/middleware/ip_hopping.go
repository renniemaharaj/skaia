package middleware

import (
	"container/list"
	"net"
	"net/http"
	"sync"

	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/internal/utils"
)

type lruCache struct {
	mu       sync.Mutex
	capacity int
	cache    map[int64]*list.Element
	ll       *list.List
}

type lruEntry struct {
	key   int64
	value string
}

func newLRUCache(capacity int) *lruCache {
	return &lruCache{
		capacity: capacity,
		cache:    make(map[int64]*list.Element),
		ll:       list.New(),
	}
}

func (c *lruCache) load(key int64) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ele, hit := c.cache[key]; hit {
		c.ll.MoveToFront(ele)
		return ele.Value.(*lruEntry).value, true
	}
	return "", false
}

func (c *lruCache) store(key int64, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ele, hit := c.cache[key]; hit {
		c.ll.MoveToFront(ele)
		ele.Value.(*lruEntry).value = value
		return
	}
	ele := c.ll.PushFront(&lruEntry{key, value})
	c.cache[key] = ele
	if c.capacity != 0 && c.ll.Len() > c.capacity {
		c.removeOldest()
	}
}

func (c *lruCache) removeOldest() {
	ele := c.ll.Back()
	if ele != nil {
		c.ll.Remove(ele)
		kv := ele.Value.(*lruEntry)
		delete(c.cache, kv.key)
	}
}

var lastIPs = newLRUCache(100000)

// IPHoppingMiddleware detects if an authenticated user's IP changes.
// If it does, it requires them to solve an MFA challenge.
func IPHoppingMiddleware(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if userID, ok := utils.UserIDFromCtx(r); ok {
				ip := extractRealIP(r)
				if lastIP, loaded := lastIPs.load(userID); loaded {
					if lastIP != ip {
						_, enabled, err := authSvc.GetTOTPEnabled(r.Context(), userID)
						if err != nil {
							utils.WriteError(w, http.StatusInternalServerError, "failed to evaluate session risk")
							return
						}
						if enabled {
							if err := authSvc.RequireMFA(r.Context(), userID, auth.MFAReasonIPChanged, ""); err != nil {
								utils.WriteError(w, http.StatusInternalServerError, "failed to secure changed session")
								return
							}
						}
						lastIPs.store(userID, ip)
					}
				} else {
					lastIPs.store(userID, ip)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// extractRealIP robustly extracts the client IP, handling Cloudflare, proxies, and stripping TCP ports.
func extractRealIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		for i := 0; i < len(ip); i++ {
			if ip[i] == ',' {
				return ip[:i]
			}
		}
		return ip
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
