package inbox

import (
	"encoding/json"
	"net/http"

	"github.com/skaia/backend/auth"
)

// HasClaim reports whether the JWT claims contain the given permission or admin role.
func HasClaim(claims *auth.Claims, permission string) bool {
	for _, r := range claims.Roles {
		if r == "admin" {
			return true
		}
	}
	for _, p := range claims.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

// ClaimsFromCtx extracts auth.Claims set by JWTAuthMiddleware.
func ClaimsFromCtx(r *http.Request) (*auth.Claims, bool) {
	c, ok := r.Context().Value("claims").(*auth.Claims)
	return c, ok
}

// WriteJSON serialises v to JSON and sets Content-Type.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

// WriteError writes a JSON {"error": msg} response.
func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}
