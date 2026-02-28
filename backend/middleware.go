package main

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/httprate"
	"github.com/skaia/backend/auth"
)

// JWTAuthMiddleware validates JWT tokens from the Authorization header
func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error": "missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, `{"error": "invalid authorization header"}`, http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]
		claims, err := auth.ValidateToken(tokenString)
		if err != nil {
			http.Error(w, `{"error": "invalid token"}`, http.StatusUnauthorized)
			return
		}

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
