// Package middleware provides reusable HTTP middleware for JWT authentication
// and rate limiting. Import it in main (or any handler package) and pass the
// exported functions wherever a func(http.Handler) http.Handler is expected.
package middleware

import (
"context"
"log"
"net/http"
"strings"

"github.com/go-chi/httprate"
"github.com/skaia/backend/auth"
)

// JWTAuthMiddleware validates the Bearer token in the Authorization header.
// It responds 401 when the header is absent or the token is invalid, and
// stores the parsed *auth.Claims in the request context under the key "claims".
func JWTAuthMiddleware(next http.Handler) http.Handler {
return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
authHeader := r.Header.Get("Authorization")
if authHeader == "" {
log.Printf("mw: no authorization header for %s %s", r.Method, r.URL.Path)
http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
return
}

parts := strings.SplitN(authHeader, " ", 2)
if len(parts) != 2 || parts[0] != "Bearer" {
http.Error(w, `{"error":"invalid authorization header"}`, http.StatusUnauthorized)
return
}

claims, err := auth.ValidateToken(parts[1])
if err != nil {
log.Printf("mw: token validation error: %v", err)
http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
return
}

ctx := context.WithValue(r.Context(), "claims", claims)
ctx = context.WithValue(ctx, "user_id", claims.UserID)
ctx = context.WithValue(ctx, "user_roles", claims.Roles)
next.ServeHTTP(w, r.WithContext(ctx))
})
}

// OptionalJWTAuthMiddleware enriches the request context when a valid Bearer
// token is present but passes the request through even without one.
// Use this on public endpoints that optionally serve personalised data.
func OptionalJWTAuthMiddleware(next http.Handler) http.Handler {
return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
authHeader := r.Header.Get("Authorization")
if authHeader != "" {
parts := strings.SplitN(authHeader, " ", 2)
if len(parts) == 2 && parts[0] == "Bearer" {
if claims, err := auth.ValidateToken(parts[1]); err == nil {
ctx := context.WithValue(r.Context(), "claims", claims)
ctx = context.WithValue(ctx, "user_id", claims.UserID)
ctx = context.WithValue(ctx, "user_roles", claims.Roles)
r = r.WithContext(ctx)
}
}
}
next.ServeHTTP(w, r)
})
}

// PermissionMiddleware checks that the authenticated user holds the given
// permission string (or the "admin" role). Must be chained after
// JWTAuthMiddleware so that claims are present in the context.
func PermissionMiddleware(permission string) func(http.Handler) http.Handler {
return func(next http.Handler) http.Handler {
return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
claims, ok := r.Context().Value("claims").(*auth.Claims)
if !ok || claims == nil {
http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
return
}

for _, role := range claims.Roles {
if role == "admin" {
next.ServeHTTP(w, r)
return
}
}

for _, perm := range claims.Permissions {
if perm == permission {
next.ServeHTTP(w, r)
return
}
}

http.Error(w, `{"error":"insufficient permissions"}`, http.StatusForbidden)
})
}
}

// RateLimitMiddleware applies a broad rate limit (100 req/min) suitable for
// most API endpoints.
func RateLimitMiddleware() func(http.Handler) http.Handler {
return httprate.Limit(100, 1,
httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
}),
)
}

// AuthLimitMiddleware applies a stricter rate limit (10 req/min) for
// authentication endpoints to slow down brute-force attempts.
func AuthLimitMiddleware() func(http.Handler) http.Handler {
return httprate.Limit(10, 1,
httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
http.Error(w, `{"error":"too many auth attempts"}`, http.StatusTooManyRequests)
}),
)
}
