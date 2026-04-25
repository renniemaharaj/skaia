package middleware

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/httprate"
)

// penaltyBox enforces a lockout period after a client triggers a rate limit.
// Once penalised, every request from that key is rejected until the penalty
// expires — the client cannot "reset" by simply waiting for the sliding
// window counter to roll over.
type penaltyBox struct {
	mu      sync.RWMutex
	entries map[string]time.Time // key => penalty expiry
}

var (
	ipPenalty        = newPenaltyBox()
	clientPenalty    = newPenaltyBox()
	authPenalty      = newPenaltyBox()
	compileIPPen     = newPenaltyBox()
	compileClientPen = newPenaltyBox()
)

func newPenaltyBox() *penaltyBox {
	pb := &penaltyBox{entries: make(map[string]time.Time)}
	go pb.cleanup()
	return pb
}

// penalize records a lockout for key lasting duration from now.
func (pb *penaltyBox) penalize(key string, d time.Duration) {
	pb.mu.Lock()
	pb.entries[key] = time.Now().Add(d)
	pb.mu.Unlock()
}

// check returns the remaining lockout duration. If the key is not penalised
// (or the penalty expired) it returns 0, false.
func (pb *penaltyBox) check(key string) (remaining time.Duration, active bool) {
	pb.mu.RLock()
	until, ok := pb.entries[key]
	pb.mu.RUnlock()
	if !ok {
		return 0, false
	}
	rem := time.Until(until)
	if rem <= 0 {
		return 0, false
	}
	return rem, true
}

// cleanup periodically removes expired entries to prevent unbounded growth.
func (pb *penaltyBox) cleanup() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		pb.mu.Lock()
		now := time.Now()
		for k, v := range pb.entries {
			if now.After(v) {
				delete(pb.entries, k)
			}
		}
		pb.mu.Unlock()
	}
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
