package middleware

import (
	"context"
	"net/http"
	"strings"

	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
)

// JWTAuthMiddleware validates the Bearer token in the Authorization header.
func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, `{"error":"invalid authorization header"}`, http.StatusUnauthorized)
			return
		}

		claims, err := ijwt.ValidateToken(parts[1])
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), ictx.CtxKeyClaims, claims)
		ctx = context.WithValue(ctx, ictx.CtxKeyUserID, claims.UserID)
		ctx = context.WithValue(ctx, ictx.CtxKeyUserRoles, claims.Roles)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// OptionalJWTAuthMiddleware enriches context when a valid Bearer token
// is present but passes unauthenticated requests through.
func OptionalJWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				if claims, err := ijwt.ValidateToken(parts[1]); err == nil {
					ctx := context.WithValue(r.Context(), ictx.CtxKeyClaims, claims)
					ctx = context.WithValue(ctx, ictx.CtxKeyUserID, claims.UserID)
					ctx = context.WithValue(ctx, ictx.CtxKeyUserRoles, claims.Roles)
					r = r.WithContext(ctx)
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
