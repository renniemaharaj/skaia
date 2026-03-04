// Package utils provides HTTP helpers and shared interfaces for all internal
// domain handlers.
package utils

import (
	"encoding/json"
	"net/http"

	"github.com/skaia/backend/internal/auth"
)

// Authorizer performs DB-backed permission checks so handlers never rely on
// stale JWT claims for access control.
type Authorizer interface {
	HasPermission(userID int64, permission string) (bool, error)
}

// UserIDFromCtx extracts the authenticated user's ID from the request context
// (populated by JWTAuthMiddleware). Returns (0, false) for unauthenticated
// requests.
func UserIDFromCtx(r *http.Request) (int64, bool) {
	c, ok := r.Context().Value("claims").(*auth.Claims)
	if !ok || c == nil {
		return 0, false
	}
	return c.UserID, true
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

// CheckPerm performs a DB-backed permission check. It writes a 403 and returns
// false when the user lacks the permission or the lookup fails. Use the return
// value to gate handler logic:
//
//	if !utils.CheckPerm(w, h.authz, userID, "forum.thread-new") { return }
func CheckPerm(w http.ResponseWriter, authz Authorizer, userID int64, permission string) bool {
	ok, err := authz.HasPermission(userID, permission)
	if err != nil || !ok {
		WriteError(w, http.StatusForbidden, "forbidden")
		return false
	}
	return true
}
