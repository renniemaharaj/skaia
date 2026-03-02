package main

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/httprate"
	"github.com/skaia/backend/auth"
)

// OptionalJWTAuthMiddleware parses the JWT token if present but does NOT fail on missing token.
// Use this on public endpoints that want to enrich responses with user-specific data when authenticated.
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

// JWTAuthMiddleware validates JWT tokens from the Authorization header
func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			log.Printf("DEBUG: No authorization header for %s %s", r.Method, r.URL.Path)
			http.Error(w, `{"error": "missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			preview := authHeader
			if len(preview) > 20 {
				preview = preview[:20]
			}
			log.Printf("DEBUG: Invalid authorization format: %s", preview)
			http.Error(w, `{"error": "invalid authorization header"}`, http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]
		preview := tokenString
		if len(preview) > 20 {
			preview = preview[:20]
		}
		log.Printf("DEBUG: Validating token (first 20 chars): %s... for %s %s", preview, r.Method, r.URL.Path)

		// Try to parse the token to get claims without validation first
		claims, err := auth.ValidateToken(tokenString)
		if err != nil {
			log.Printf("DEBUG: Token validation error: %v (token exp in payload)", err)
			http.Error(w, `{"error": "invalid token"}`, http.StatusUnauthorized)
			return
		}

		log.Printf("DEBUG: Token valid for user %s (%d) with permissions: %v", claims.Username, claims.UserID, claims.Permissions)
		// Store claims in request context
		ctx := context.WithValue(r.Context(), "claims", claims)
		ctx = context.WithValue(ctx, "user_id", claims.UserID)
		ctx = context.WithValue(ctx, "user_roles", claims.Roles)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// PermissionMiddleware checks if the user has the required permission
func PermissionMiddleware(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value("claims").(*auth.Claims)
			if !ok || claims == nil {
				http.Error(w, `{"error": "unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Admin always has all permissions
			for _, role := range claims.Roles {
				if role == "admin" {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Check if user has the required permission
			hasPermission := false
			for _, perm := range claims.Permissions {
				if perm == permission {
					hasPermission = true
					break
				}
			}

			if !hasPermission {
				http.Error(w, `{"error": "insufficient permissions"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// OptionalJWTMiddleware validates JWT if present, but doesn't require it
func OptionalJWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				claims, err := auth.ValidateToken(parts[1])
				if err == nil {
					ctx := context.WithValue(r.Context(), "claims", claims)
					ctx = context.WithValue(ctx, "user_id", claims.UserID)
					r = r.WithContext(ctx)
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}

// RateLimitMiddleware applies rate limiting
func RateLimitMiddleware() func(http.Handler) http.Handler {
	return httprate.Limit(
		100, // requests
		1,   // per minute
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error": "rate limit exceeded"}`, http.StatusTooManyRequests)
		}),
	)
}

// AuthLimitMiddleware applies stricter rate limiting to auth endpoints
func AuthLimitMiddleware() func(http.Handler) http.Handler {
	return httprate.Limit(
		10, // requests
		1,  // per minute
		httprate.WithLimitHandler(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, `{"error": "too many auth attempts"}`, http.StatusTooManyRequests)
		}),
	)
}
