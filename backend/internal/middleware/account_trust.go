package middleware

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/skaia/backend/internal/security"
	"github.com/skaia/backend/internal/utils"
)

var ownProfilePath = regexp.MustCompile(`^/api/users/[1-9][0-9]*$`)

// guestMutationException is the reviewed guest capability registry. Everything
// not named here is browse-only until an authenticated established account is
// present. Keep entries narrow and pair additions with abuse-control tests.
func guestMutationException(method, path string) bool {
	if method != http.MethodPost {
		return false
	}
	switch path {
	case "/api/auth/register", "/api/auth/login", "/api/auth/login/totp",
		"/api/auth/refresh", "/api/auth/verify-email", "/api/auth/forgot-password",
		"/api/auth/reset-password", "/api/users/batch",
		"/api/store/orders/guest-lookup", "/api/voice/livekit-token", "/api/arm", "/api/disarm":
		return true
	}
	if strings.HasPrefix(path, "/api/pages/") && strings.HasSuffix(path, "/view") {
		return true
	}
	if strings.HasPrefix(path, "/api/forum/threads/") && strings.HasSuffix(path, "/view") {
		return true
	}
	if strings.HasPrefix(path, "/api/config/datasources/") && strings.HasSuffix(path, "/execute") {
		return true
	}
	return false
}

func provisionalMutationException(method, path string, userID int64) bool {
	if guestMutationException(method, path) {
		return true
	}
	if method == http.MethodPost {
		switch path {
		case "/api/auth/logout", "/api/auth/resend-verification", "/api/auth/change-password",
			"/api/auth/totp/setup", "/api/auth/totp/enable", "/api/auth/mfa-challenge":
			return true
		}
	}
	if method == http.MethodPut && ownProfilePath.MatchString(path) {
		return path == "/api/users/"+strconv.FormatInt(userID, 10)
	}
	return false
}

func isMutation(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func requiresEstablishedRead(path string) bool {
	for _, prefix := range []string{
		"/api/analytics/", "/api/events", "/api/grengo/", "/api/instances",
		"/api/mediascraper/", "/api/trash/", "/api/clipmaker/",
	} {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

// AccountTrustBoundary rejects unregistered guest writes and provisional
// account mutations before route handlers can reach repositories or dispatchers.
func AccountTrustBoundary(policy *security.AccountTrustPolicy) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isMutation(r.Method) && !requiresEstablishedRead(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			userID, authenticated := utils.UserIDFromCtx(r)
			if !authenticated {
				if !isMutation(r.Method) {
					utils.WriteError(w, http.StatusUnauthorized, "authentication required")
					return
				}
				if guestMutationException(r.Method, r.URL.Path) {
					security.DefaultSafeguardTelemetry.RecordGuestException()
					next.ServeHTTP(w, r)
					return
				}
				utils.WriteError(w, http.StatusUnauthorized, "authentication required")
				return
			}

			decision, err := policy.RequireEstablished(r.Context(), userID)
			if err == nil {
				next.ServeHTTP(w, r)
				return
			}
			if errors.Is(err, security.ErrAccountProvisional) && provisionalMutationException(r.Method, r.URL.Path, userID) {
				next.ServeHTTP(w, r)
				return
			}
			if errors.Is(err, security.ErrAccountProvisional) {
				security.DefaultSafeguardTelemetry.RecordProvisionalDenial()
				utils.WriteJSON(w, http.StatusForbidden, map[string]any{
					"error":             "This account is temporarily limited to browsing while it establishes trust.",
					"reason_code":       security.ReasonAccountProvisional,
					"unlock_at":         decision.UnlockAt,
					"remaining_seconds": decision.RemainingSeconds,
					"totp_setup_route":  "/settings/security",
				})
				return
			}
			utils.WriteError(w, http.StatusForbidden, "account is not permitted to perform this action")
		})
	}
}
