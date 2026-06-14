package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/skaia/backend/config" // replace with your actual Go module path
)

// Key helpers — one place so typos are impossible.
func keyJailed(ip string) string  { return fmt.Sprintf("ip:jailed:%s", ip) }
func keyTrusted(ip string) string { return fmt.Sprintf("ip:trusted:%s", ip) }
func keyHistory(ip string) string { return fmt.Sprintf("ip:history:%s", ip) }
func keyCounter(ip string) string { return fmt.Sprintf("ip:counter:%s", ip) }

var TelemetryTrigger = make(chan struct{}, 1)

// TriggerUpdate sends a lightweight signal to update DEFCON telemetry asynchronously.
func TriggerUpdate() {
	select {
	case TelemetryTrigger <- struct{}{}:
	default:
	}
}

//
// Tier 1 — Jail
//

// IsJailed returns true if the IP is currently serving a jail sentence.
func IsJailed(ctx context.Context, rdb *redis.Client, ip string) (bool, error) {
	exists, err := rdb.Exists(ctx, keyJailed(ip)).Result()
	return exists == 1, err
}

// JailIP adds the IP to the jail bucket and returns the current total jailed count.
// Call this when an IP exceeds its adaptive allowance.
func JailIP(ctx context.Context, rdb *redis.Client, ip string) (int64, error) {
	cfg := config.RateLimit
	pipe := rdb.Pipeline()

	// SET ip:jailed:{IP} 1 EX <JailTTL seconds> NX
	// NX so a re-triggered jail doesn't reset an existing sentence.
	pipe.SetNX(ctx, keyJailed(ip), 1, cfg.JailTTL)

	// Remove from purgatory history — they start fresh after the sentence.
	pipe.Del(ctx, keyHistory(ip))
	pipe.Del(ctx, keyCounter(ip))

	if _, err := pipe.Exec(ctx); err != nil {
		return 0, fmt.Errorf("jail pipeline: %w", err)
	}

	TriggerUpdate()

	// Return live jailed IP count so the caller can log / alert.
	count, err := JailedCount(ctx, rdb)
	return count, err
}

// JailedCount returns the number of IPs currently in jail.
// This is used by the adaptive allowance formula.
// It uses SCAN so it never blocks the Redis event loop (unlike KEYS).
func JailedCount(ctx context.Context, rdb *redis.Client) (int64, error) {
	var count int64
	var cursor uint64

	for {
		keys, nextCursor, err := rdb.Scan(ctx, cursor, "ip:jailed:*", 100).Result()
		if err != nil {
			return 0, fmt.Errorf("scan jailed: %w", err)
		}
		count += int64(len(keys))
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
	return count, nil
}

//
// Tier 2 — Trusted citizens
//

// IsTrusted returns true if the IP holds a trusted citizen token.
// It also slides the TTL forward on every hit so active users never expire.
func IsTrusted(ctx context.Context, rdb *redis.Client, ip string) (bool, error) {
	cfg := config.RateLimit
	key := keyTrusted(ip)

	// GETEX: atomic get + reset TTL in one round-trip (Redis ≥ 6.2).
	val, err := rdb.GetEx(ctx, key, cfg.TrustedTTL).Result()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("trusted check: %w", err)
	}
	return val != "", nil
}

// PromoteToTrusted moves an IP from purgatory to the trusted bucket.
func PromoteToTrusted(ctx context.Context, rdb *redis.Client, ip string) error {
	cfg := config.RateLimit
	pipe := rdb.Pipeline()

	pipe.Set(ctx, keyTrusted(ip), 1, cfg.TrustedTTL)
	// Clean up purgatory tracking — no longer needed.
	pipe.Del(ctx, keyHistory(ip))
	pipe.Del(ctx, keyCounter(ip))

	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("promote pipeline: %w", err)
	}
	return nil
}

//
// Tier 3 — Purgatory (unknown IPs)
//

// AdaptiveAllowance computes the per-minute request ceiling for an unknown IP.
// It fetches the current jailed count and applies the DEFCON formula.
func AdaptiveAllowance(ctx context.Context, rdb *redis.Client) (int, error) {
	cfg := config.RateLimit
	jailed, err := JailedCount(ctx, rdb)
	if err != nil {
		// Fail open — return the base limit so a Redis blip doesn't DoS your users.
		return cfg.BaseLimitPerMin, err
	}

	allowance := float64(cfg.BaseLimitPerMin) / (1.0 + float64(jailed)*cfg.PenaltyFactor)

	// Clamp to the floor so new visitors always get something.
	if int(allowance) < cfg.MinFloorPerMin {
		return cfg.MinFloorPerMin, nil
	}
	return int(allowance), nil
}

// CheckAndCount increments the sliding-window request counter for a purgatory IP
// and returns (requestCount, overLimit, error).
//
// Uses a Lua script for atomicity — the INCR + EXPIRE pair is a single
// round-trip and can't be interleaved by another goroutine.
func CheckAndCount(ctx context.Context, rdb *redis.Client, ip string, limit int) (int64, bool, error) {
	cfg := config.RateLimit
	key := keyCounter(ip)
	windowSecs := int64(cfg.CounterWindow.Seconds())

	// Lua: INCR the key, set EX only on first creation, return new value.
	script := redis.NewScript(`
		local count = redis.call("INCR", KEYS[1])
		if count == 1 then
			redis.call("EXPIRE", KEYS[1], ARGV[1])
		end
		return count
	`)

	result, err := script.Run(ctx, rdb, []string{key}, windowSecs).Int64()
	if err != nil {
		return 0, false, fmt.Errorf("counter script: %w", err)
	}

	return result, result > int64(limit), nil
}

//
// Graduation
//

// RecordCleanRequest increments the graduation counter for a purgatory IP
// and returns true if the IP has now met the graduation threshold.
//
// The graduation counter has its own TTL (GraduationWindow). If the IP goes
// quiet for longer than that window, the counter resets — they must prove
// themselves again in a fresh window.
func RecordCleanRequest(ctx context.Context, rdb *redis.Client, ip string) (bool, error) {
	cfg := config.RateLimit
	key := keyHistory(ip)
	windowSecs := int64(cfg.GraduationWindow.Seconds())

	script := redis.NewScript(`
		local count = redis.call("INCR", KEYS[1])
		if count == 1 then
			redis.call("EXPIRE", KEYS[1], ARGV[1])
		end
		return count
	`)

	count, err := script.Run(ctx, rdb, []string{key}, windowSecs).Int64()
	if err != nil {
		return false, fmt.Errorf("history script: %w", err)
	}

	return count >= cfg.GraduationRequests, nil
}

//
// Trusted IP rate limiting (high ceiling, not unlimited)
//

// CheckTrustedLimit applies the hard ceiling to a trusted IP using the same
// sliding-window counter. Trusted IPs get BaseLimitPerMin regardless of the
// global threat level — but they are not exempt from all limits.
func CheckTrustedLimit(ctx context.Context, rdb *redis.Client, ip string) (bool, error) {
	cfg := config.RateLimit
	_, over, err := CheckAndCount(ctx, rdb, ip, cfg.TrustedLimitPerMin)
	return over, err
}

//
// Utility
//

// RealIP extracts the client IP, preferring X-Forwarded-For (set by Cloudflare
// or any upstream proxy) over the raw RemoteAddr.
// In production behind Cloudflare, use CF-Connecting-IP instead.
// func RealIP(r interface {
// 	Header() interface{ Get(string) string }
// 	RemoteAddr() string
// }) string {
// 	// This signature is illustrative — see middleware/ratelimit.go for the real
// 	// http.Request-based implementation.
// 	return ""
// }

// WindowRemaining returns the TTL left on an IP's rate-limit window,
// useful for populating the Retry-After response header.
func WindowRemaining(ctx context.Context, rdb *redis.Client, ip string) time.Duration {
	ttl, err := rdb.TTL(ctx, keyCounter(ip)).Result()
	if err != nil || ttl < 0 {
		return config.RateLimit.CounterWindow
	}
	return ttl
}

// JailTimeRemaining returns the TTL left on an IP's jail sentence.
func JailTimeRemaining(ctx context.Context, rdb *redis.Client, ip string) time.Duration {
	ttl, err := rdb.TTL(ctx, keyJailed(ip)).Result()
	if err != nil || ttl < 0 {
		return 0
	}
	return ttl
}
