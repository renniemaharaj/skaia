package middleware

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/skaia/backend/database"
	ijwt "github.com/skaia/backend/internal/jwt"
	_ "github.com/lib/pq"
)

// ── Lazy DB connection ────────────────────────────────────────────────────────

var grengoAPIKeyDB struct {
	sync.Mutex
	db *sql.DB
}

// grengoDB returns (and caches) an open connection to the grengo database.
// Only a successful connection is cached; transient failures are not stored so
// the next request can retry without a process restart.
func grengoDB() (*sql.DB, error) {
	grengoAPIKeyDB.Lock()
	defer grengoAPIKeyDB.Unlock()
	if grengoAPIKeyDB.db != nil {
		return grengoAPIKeyDB.db, nil
	}
	dsn := os.Getenv("GRENGO_DATABASE_URL")
	if dsn == "" {
		dsn = deriveGrengoDSN(os.Getenv("DATABASE_URL"))
	}
	if dsn == "" {
		return nil, fmt.Errorf("GRENGO_DATABASE_URL not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	grengoAPIKeyDB.db = db
	return db, nil
}

// deriveGrengoDSN rewrites DATABASE_URL to point at the "grengo" database.
func deriveGrengoDSN(dsn string) string {
	if dsn == "" {
		return ""
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	u.Path = "/grengo"
	return u.String()
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

// hashAPIKey returns the hex-encoded SHA-256 of the raw key.
func hashAPIKey(rawKey string) string {
	sum := sha256.Sum256([]byte(rawKey))
	return hex.EncodeToString(sum[:])
}

// keyPrefix returns the first 12 characters of rawKey used as the lookup prefix.
func keyPrefix(rawKey string) string {
	if len(rawKey) > 12 {
		return rawKey[:12]
	}
	return rawKey
}

// ── Repository helpers ────────────────────────────────────────────────────────

type apiKeyRecord struct {
	keyID     int64
	userID    int64
	threshold int
}

// lookupAPIKey fetches key metadata from grengo_api_keys.
// Returns sql.ErrNoRows when the key is not found or has been revoked.
func lookupAPIKey(ctx context.Context, db *sql.DB, prefix, hashHex string) (apiKeyRecord, error) {
	var rec apiKeyRecord
	err := db.QueryRowContext(ctx, `
		SELECT id, user_id, threshold_per_minute
		FROM grengo_api_keys
		WHERE key_prefix = $1 AND key_hash = $2 AND revoked_at IS NULL
	`, prefix, hashHex).Scan(&rec.keyID, &rec.userID, &rec.threshold)
	return rec, err
}

// collectPermissions intersects the API key's module grants with the user's
// tenant-level permissions and returns the allowed permission strings.
func collectPermissions(ctx context.Context, grengoDb *sql.DB, rec apiKeyRecord) ([]string, error) {
	rows, err := grengoDb.QueryContext(ctx, `
		SELECT module, can_read, can_write
		FROM grengo_api_key_permissions
		WHERE api_key_id = $1
	`, rec.keyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	permSet := map[string]struct{}{}
	for rows.Next() {
		var module string
		var canRead, canWrite bool
		if err := rows.Scan(&module, &canRead, &canWrite); err != nil {
			return nil, err
		}
		module = strings.TrimSpace(module)
		if module == "" {
			continue
		}
		for _, grant := range moduleGrants(module, canRead, canWrite) {
			if hasTenantPermission(ctx, database.DB, rec.userID, grant) {
				permSet[grant] = struct{}{}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	perms := make([]string, 0, len(permSet))
	for p := range permSet {
		perms = append(perms, p)
	}
	return perms, nil
}

// touchLastUsed fires an async UPDATE so callers are never blocked by it.
func touchLastUsed(ctx context.Context, db *sql.DB, keyID int64) {
	_, _ = db.ExecContext(ctx, `UPDATE grengo_api_keys SET last_used_at = NOW() WHERE id = $1`, keyID)
}

// hasTenantPermission returns true when userID holds permission in the tenant DB.
func hasTenantPermission(ctx context.Context, db *sql.DB, userID int64, permission string) bool {
	if db == nil {
		return false
	}
	var ok bool
	err := db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM user_permissions up
			JOIN permissions p ON up.permission_id = p.id
			WHERE up.user_id = $1 AND p.name = $2
			UNION
			SELECT 1 FROM role_permissions rp
			JOIN permissions p ON rp.permission_id = p.id
			JOIN user_roles ur ON rp.role_id = ur.role_id
			WHERE ur.user_id = $1 AND p.name = $2
		)
	`, userID, permission).Scan(&ok)
	return err == nil && ok
}

// moduleGrants expands a module + read/write flags into permission name(s).
func moduleGrants(module string, canRead, canWrite bool) []string {
	grants := make([]string, 0, 2)
	if canRead {
		grants = append(grants, module+".read")
	}
	if canWrite {
		grants = append(grants, module+".write")
	}
	return grants
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

type apiKeyWindow struct {
	start time.Time
	count int
}

var apiKeyLimits struct {
	sync.Mutex
	windows map[string]apiKeyWindow
}

// apiKeyWithinLimit enforces a per-prefix sliding-window rate limit.
func apiKeyWithinLimit(prefix string, threshold int) bool {
	if threshold <= 0 {
		threshold = 60
	}
	now := time.Now()
	apiKeyLimits.Lock()
	defer apiKeyLimits.Unlock()
	if apiKeyLimits.windows == nil {
		apiKeyLimits.windows = make(map[string]apiKeyWindow)
	}
	window := apiKeyLimits.windows[prefix]
	if window.start.IsZero() || now.Sub(window.start) >= time.Minute {
		apiKeyLimits.windows[prefix] = apiKeyWindow{start: now, count: 1}
		return true
	}
	if window.count >= threshold {
		return false
	}
	window.count++
	apiKeyLimits.windows[prefix] = window
	return true
}

// ── Header extraction ─────────────────────────────────────────────────────────

// apiKeyFromRequestHeaders extracts a raw API key from request headers.
// Checks X-Skaia-API-Key / X-Grengo-API-Key / X-API-Key first, then the
// "ApiKey <key>" Authorization scheme.
func apiKeyFromRequestHeaders(headers http.Header, authHeader string) string {
	for _, name := range []string{"X-Skaia-API-Key", "X-Grengo-API-Key", "X-API-Key"} {
		if v := headers.Get(name); v != "" {
			return strings.TrimSpace(v)
		}
	}
	const scheme = "ApiKey "
	if strings.HasPrefix(authHeader, scheme) {
		return strings.TrimSpace(strings.TrimPrefix(authHeader, scheme))
	}
	return ""
}

// ── Public entry point ────────────────────────────────────────────────────────

// claimsFromAPIKey resolves a raw API key to JWT claims, or returns false when
// the key is absent, unknown, revoked, or rate-limited.
func claimsFromAPIKey(ctx context.Context, rawKey string) (*ijwt.Claims, bool) {
	rawKey = strings.TrimSpace(rawKey)
	if rawKey == "" {
		return nil, false
	}

	db, err := grengoDB()
	if err != nil {
		return nil, false
	}

	prefix := keyPrefix(rawKey)
	hashHex := hashAPIKey(rawKey)

	rec, err := lookupAPIKey(ctx, db, prefix, hashHex)
	if err != nil {
		return nil, false
	}
	if !apiKeyWithinLimit(prefix, rec.threshold) {
		return nil, false
	}

	permissions, err := collectPermissions(ctx, db, rec)
	if err != nil {
		return nil, false
	}

	go touchLastUsed(ctx, db, rec.keyID)

	return &ijwt.Claims{
		UserID:      rec.userID,
		Username:    "api-key",
		DisplayName: "API Key",
		Roles:       []string{"api-key"},
		Permissions: permissions,
	}, true
}
