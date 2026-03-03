package middleware_test

import (
"net/http"
"net/http/httptest"
"testing"

"github.com/skaia/backend/auth"
mw "github.com/skaia/backend/internal/middleware"
"github.com/stretchr/testify/assert"
"github.com/stretchr/testify/require"
)

// okHandler always responds HTTP 200 so we can verify middleware pass-through.
func okHandler() http.Handler {
return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
w.WriteHeader(http.StatusOK)
})
}

// validToken returns a signed JWT with "user" role. No database required.
func validToken(t *testing.T) string {
t.Helper()
tok, err := auth.GenerateToken(42, "testuser", "test@example.com", "Test User", []string{"user"})
require.NoError(t, err)
return tok
}

// adminToken returns a signed JWT with the "admin" role.
func adminToken(t *testing.T) string {
t.Helper()
tok, err := auth.GenerateTokenWithPermissions(
1, "admin", "admin@example.com", "Admin", []string{"admin"}, []string{},
)
require.NoError(t, err)
return tok
}

// ── JWTAuthMiddleware ─────────────────────────────────────────────────────────

func TestJWTAuthMiddleware_MissingHeader_Returns401(t *testing.T) {
h := mw.JWTAuthMiddleware(okHandler())
req := httptest.NewRequest(http.MethodGet, "/", nil)
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestJWTAuthMiddleware_InvalidScheme_Returns401(t *testing.T) {
h := mw.JWTAuthMiddleware(okHandler())
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestJWTAuthMiddleware_GarbageToken_Returns401(t *testing.T) {
h := mw.JWTAuthMiddleware(okHandler())
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer not.a.real.token")
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestJWTAuthMiddleware_ValidToken_Passes(t *testing.T) {
tok := validToken(t)
h := mw.JWTAuthMiddleware(okHandler())
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusOK, w.Code)
}

func TestJWTAuthMiddleware_SetsUserIDInContext(t *testing.T) {
tok := validToken(t)
var capturedUserID any
inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
capturedUserID = r.Context().Value("user_id")
w.WriteHeader(http.StatusOK)
})
h := mw.JWTAuthMiddleware(inner)
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
h.ServeHTTP(httptest.NewRecorder(), req)
assert.Equal(t, int64(42), capturedUserID, "user_id must be propagated from token")
}

func TestJWTAuthMiddleware_SetsRolesInContext(t *testing.T) {
tok := validToken(t)
var capturedRoles any
inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
capturedRoles = r.Context().Value("user_roles")
w.WriteHeader(http.StatusOK)
})
h := mw.JWTAuthMiddleware(inner)
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
h.ServeHTTP(httptest.NewRecorder(), req)
roles, ok := capturedRoles.([]string)
require.True(t, ok, "user_roles must be []string")
assert.Contains(t, roles, "user")
}

func TestJWTAuthMiddleware_BearerWithoutToken_Returns401(t *testing.T) {
h := mw.JWTAuthMiddleware(okHandler())
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer")
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// ── OptionalJWTAuthMiddleware ─────────────────────────────────────────────────

func TestOptionalJWTAuthMiddleware_NoHeader_Passes(t *testing.T) {
h := mw.OptionalJWTAuthMiddleware(okHandler())
req := httptest.NewRequest(http.MethodGet, "/", nil)
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusOK, w.Code)
}

func TestOptionalJWTAuthMiddleware_NoHeader_NoUserIDInContext(t *testing.T) {
var capturedUserID any
inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
capturedUserID = r.Context().Value("user_id")
w.WriteHeader(http.StatusOK)
})
h := mw.OptionalJWTAuthMiddleware(inner)
req := httptest.NewRequest(http.MethodGet, "/", nil)
h.ServeHTTP(httptest.NewRecorder(), req)
assert.Nil(t, capturedUserID, "no user_id without token")
}

func TestOptionalJWTAuthMiddleware_ValidToken_EnrichesContext(t *testing.T) {
tok := validToken(t)
var capturedUserID any
inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
capturedUserID = r.Context().Value("user_id")
w.WriteHeader(http.StatusOK)
})
h := mw.OptionalJWTAuthMiddleware(inner)
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
h.ServeHTTP(httptest.NewRecorder(), req)
assert.Equal(t, int64(42), capturedUserID)
}

func TestOptionalJWTAuthMiddleware_InvalidToken_StillPasses(t *testing.T) {
var capturedUserID any
inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
capturedUserID = r.Context().Value("user_id")
w.WriteHeader(http.StatusOK)
})
h := mw.OptionalJWTAuthMiddleware(inner)
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer invalid.token.garbage")
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusOK, w.Code, "invalid token must not block the request")
assert.Nil(t, capturedUserID, "user_id must not be set for invalid token")
}

// ── PermissionMiddleware ──────────────────────────────────────────────────────

func TestPermissionMiddleware_NoClaims_Returns401(t *testing.T) {
h := mw.PermissionMiddleware("read:data")(okHandler())
req := httptest.NewRequest(http.MethodGet, "/", nil)
w := httptest.NewRecorder()
h.ServeHTTP(w, req)
assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestPermissionMiddleware_WrongPermission_Returns403(t *testing.T) {
tok, err := auth.GenerateTokenWithPermissions(
1, "u", "u@example.com", "U",
[]string{"user"}, []string{"read:other"},
)
require.NoError(t, err)
chain := mw.JWTAuthMiddleware(mw.PermissionMiddleware("read:data")(okHandler()))
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
w := httptest.NewRecorder()
chain.ServeHTTP(w, req)
assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestPermissionMiddleware_CorrectPermission_Passes(t *testing.T) {
tok, err := auth.GenerateTokenWithPermissions(
1, "u", "u@example.com", "U",
[]string{"user"}, []string{"read:data"},
)
require.NoError(t, err)
chain := mw.JWTAuthMiddleware(mw.PermissionMiddleware("read:data")(okHandler()))
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
w := httptest.NewRecorder()
chain.ServeHTTP(w, req)
assert.Equal(t, http.StatusOK, w.Code)
}

func TestPermissionMiddleware_AdminRole_BypassesPermissionCheck(t *testing.T) {
tok := adminToken(t)
chain := mw.JWTAuthMiddleware(mw.PermissionMiddleware("some.obscure.perm")(okHandler()))
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
w := httptest.NewRecorder()
chain.ServeHTTP(w, req)
assert.Equal(t, http.StatusOK, w.Code, "admin role must bypass any permission requirement")
}

func TestPermissionMiddleware_MultiplePermissions_PassesOnMatch(t *testing.T) {
tok, err := auth.GenerateTokenWithPermissions(
2, "u2", "u2@example.com", "U2",
[]string{"user"}, []string{"write:data", "read:data", "delete:data"},
)
require.NoError(t, err)
for _, perm := range []string{"read:data", "write:data", "delete:data"} {
chain := mw.JWTAuthMiddleware(mw.PermissionMiddleware(perm)(okHandler()))
req := httptest.NewRequest(http.MethodGet, "/", nil)
req.Header.Set("Authorization", "Bearer "+tok)
w := httptest.NewRecorder()
chain.ServeHTTP(w, req)
assert.Equal(t, http.StatusOK, w.Code, "permission %q should pass", perm)
}
}

// ── RateLimitMiddleware ───────────────────────────────────────────────────────

func TestRateLimitMiddleware_NormalLoad_NeverBlocked(t *testing.T) {
// 100 req/min limit — 10 rapid requests must never be rate limited.
limiter := mw.RateLimitMiddleware()
srv := httptest.NewServer(limiter(okHandler()))
defer srv.Close()
client := &http.Client{}
for i := 0; i < 10; i++ {
resp, err := client.Get(srv.URL + "/")
require.NoError(t, err)
assert.Equal(t, http.StatusOK, resp.StatusCode, "request %d must not be rate limited", i+1)
resp.Body.Close()
}
}

// TestAuthLimitMiddleware_ExceedsLimit verifies that the auth rate limiter
// returns 429 after the 10 req/min threshold is exceeded.
// A fresh httptest.Server guarantees the counter starts from zero.
func TestAuthLimitMiddleware_ExceedsLimit_Returns429(t *testing.T) {
limiter := mw.AuthLimitMiddleware()
srv := httptest.NewServer(limiter(okHandler()))
defer srv.Close()
client := &http.Client{}
hitLimit := false
for i := 0; i < 15; i++ {
resp, err := client.Post(srv.URL+"/", "application/json", nil)
require.NoError(t, err)
code := resp.StatusCode
resp.Body.Close()
if code == http.StatusTooManyRequests {
hitLimit = true
break
}
}
assert.True(t, hitLimit, "sending 15 rapid requests to the auth limiter must trigger 429")
}

func TestAuthLimitMiddleware_Returns429WithErrorBody(t *testing.T) {
limiter := mw.AuthLimitMiddleware()
srv := httptest.NewServer(limiter(okHandler()))
defer srv.Close()
client := &http.Client{}
for i := 0; i < 15; i++ {
resp, err := client.Post(srv.URL+"/", "application/json", nil)
require.NoError(t, err)
if resp.StatusCode == http.StatusTooManyRequests {
body := make([]byte, 256)
n, _ := resp.Body.Read(body)
resp.Body.Close()
assert.Contains(t, string(body[:n]), "too many",
"rate limit response must include an error message")
return
}
resp.Body.Close()
}
t.Error("never hit rate limit after 15 requests")
}
