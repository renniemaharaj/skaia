package middleware

import (
	"context"
	"net/http"
	"strings"

	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
)

// ExtractTokenMiddleware extracts the Bearer token, validates it,
// and injects claims into the context. It does not enforce authentication.
func ExtractTokenMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenStr := ""
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenStr = parts[1]
			}
		}

		if tokenStr == "" {
			tokenStr = r.URL.Query().Get("token")
		}

		if tokenStr != "" {
			if claims, err := ijwt.ValidateToken(tokenStr); err == nil {
				ctx := context.WithValue(r.Context(), ictx.CtxKeyClaims, claims)
				ctx = context.WithValue(ctx, ictx.CtxKeyUserID, claims.UserID)
				ctx = context.WithValue(ctx, ictx.CtxKeyUserRoles, claims.Roles)
				r = r.WithContext(ctx)
			}
		}

		next.ServeHTTP(w, r)
	})
}

// JWTAuthMiddleware enforces that a valid token was extracted.
// Must be used after ExtractTokenMiddleware.
func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.Context().Value(ictx.CtxKeyClaims).(*ijwt.Claims); !ok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// OptionalJWTAuthMiddleware is now a no-op since ExtractTokenMiddleware
// populates the context optionally. Kept for backwards compatibility.
func OptionalJWTAuthMiddleware(next http.Handler) http.Handler {
	return next
}
