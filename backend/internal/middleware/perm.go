package middleware

import (
	"net/http"

	"github.com/skaia/backend/internal/auth"
)

// PermissionMiddleware checks that the user holds a permission or the admin/superuser role.
func PermissionMiddleware(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(auth.CtxKeyClaims).(*auth.Claims)
			if !ok || claims == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			for _, role := range claims.Roles {
				if role == "admin" || role == "superuser" {
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
