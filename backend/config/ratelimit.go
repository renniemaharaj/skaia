package config

import "time"

// RateLimit holds every tunable constant for the DEFCON adaptive rate limiter.
// Adjust these values to match your traffic profile; nothing else needs to change.
var RateLimit = rateLimitConfig{

	// ── Tier 1: Jail ─────────────────────────────────────────────────────────
	// How long a jailed IP stays blocked before being automatically released.
	JailTTL: 15 * time.Minute,

	// How long an admin user can bypass an IP jail before needing to re-auth
	BypassTTL: 1 * time.Hour,

	// ── Tier 2: Trusted citizens ─────────────────────────────────────────────
	// Maximum requests per minute for a trusted IP (hard ceiling — not bypassed
	// entirely, because trusted machines can be compromised).
	TrustedLimitPerMin: 1500,

	// Sliding TTL reset on every request. An active user never falls out.
	// An idle user (no request for this duration) loses trusted status and
	// drops back to Purgatory on their next visit.
	TrustedTTL: 24 * time.Hour,

	// ── Tier 3: Purgatory (unknown IPs) ──────────────────────────────────────
	// Starting allowance for a brand-new IP with no history.
	BaseLimitPerMin: 100,

	// Each additional jailed IP reduces the Purgatory allowance by this factor.
	// Formula: allowance = BaseLimitPerMin / (1 + jailedCount * PenaltyFactor)
	// Example: 50 jailed IPs => 1500 / (1 + 50*0.05) = 1500/3.5 ≈ 428 req/min.
	PenaltyFactor: 0.05,

	// Floor: even during a full-scale botnet attack, unknown IPs still get this
	// many requests per minute so a brand-new legitimate user isn't locked out.
	MinFloorPerMin: 20,

	// ── Graduation thresholds ────────────────────────────────────────────────
	// A Purgatory IP graduates to Trusted after this many requests WITHOUT ever
	// hitting the rate limiter — they must complete all of these cleanly.
	GraduationRequests: 50,

	// The window in which those GraduationRequests must occur.
	GraduationWindow: 10 * time.Minute,

	// ── Sliding window (rate counter) ────────────────────────────────────────
	// The window size used for per-IP request counting.
	// Changing this also changes what "per minute" means for the limits above —
	// keep them consistent (both in seconds, or both as time.Duration).
	CounterWindow: 1 * time.Minute,

	// ── Cloudflare ───────────────────────────────────────────────────────────
	// Your Cloudflare Account ID (from the dashboard URL: /accounts/<ID>).
	CloudflareAccountID: "", // set via CF_ACCOUNT_ID env var at runtime

	// The Firewall Rules API endpoint template.
	// Filled in by cloudflare.go — you don't touch this directly.
	CloudflareAPIBase: "https://api.cloudflare.com/client/v4",

	// Timeout for the async Cloudflare push goroutine.
	// Kept short — this must never block your hot path.
	CloudflarePushTimeout: 3 * time.Second,
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal type — edit the var above, not this struct.
// ─────────────────────────────────────────────────────────────────────────────

type rateLimitConfig struct {
	JailTTL               time.Duration
	BypassTTL             time.Duration
	TrustedLimitPerMin    int
	TrustedTTL            time.Duration
	BaseLimitPerMin       int
	PenaltyFactor         float64
	MinFloorPerMin        int
	GraduationRequests    int64
	GraduationWindow      time.Duration
	CounterWindow         time.Duration
	CloudflareAccountID   string
	CloudflareAPIBase     string
	CloudflarePushTimeout time.Duration
}
