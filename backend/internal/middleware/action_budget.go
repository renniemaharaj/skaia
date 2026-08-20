package middleware

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/skaia/backend/internal/security"
	"github.com/skaia/backend/internal/utils"
)

// MutationBudget applies distributed tenant/IP and account budgets after trust
// classification and before handlers. Redis failure denies mutations without
// affecting browse traffic.
func MutationBudget(budget *security.ActionBudget) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isMutation(r.Method) {
				next.ServeHTTP(w, r)
				return
			}
			ipIdentity := "ip:" + utils.RealIP(r)
			scope, limit, window, cost := mutationBudgetClass(r.URL.Path)
			if retry, err := budget.Allow(r.Context(), scope+":ip", ipIdentity, cost, limit, window); err != nil {
				writeBudgetError(w, err, retry)
				return
			}
			if userID, ok := utils.UserIDFromCtx(r); ok {
				if retry, err := budget.Allow(r.Context(), scope+":user", "user:"+strconv.FormatInt(userID, 10), cost, limit*2, window); err != nil {
					writeBudgetError(w, err, retry)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func WebSocketUpgradeBudget(budget *security.ActionBudget) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			retry, err := budget.Allow(r.Context(), "ws-upgrade", "ip:"+utils.RealIP(r), 1, 20, time.Minute)
			if err != nil {
				writeBudgetError(w, err, retry)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func mutationBudgetClass(path string) (string, int64, time.Duration, int64) {
	switch path {
	case "/api/auth/register":
		return "register", 3, time.Hour, 1
	case "/api/auth/login", "/api/auth/login/totp":
		return "login", 10, 15 * time.Minute, 1
	case "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/verify-email", "/api/auth/resend-verification":
		return "recovery", 3, time.Hour, 1
	case "/api/store/orders/guest-lookup":
		return "guest-order-lookup", 10, time.Minute, 1
	case "/api/voice/livekit-token":
		return "guest-voice-token", 6, time.Minute, 1
	default:
		if strings.HasPrefix(path, "/api/config/datasources/") && strings.HasSuffix(path, "/execute") {
			return "datasource-execute", 10, time.Minute, 1
		}
		return "mutation", 60, time.Minute, 1
	}
}

func writeBudgetError(w http.ResponseWriter, err error, retry time.Duration) {
	if errors.Is(err, security.ErrAccountRateLimited) {
		security.DefaultSafeguardTelemetry.RecordRateDenial()
		seconds := int(retry.Seconds())
		if seconds < 1 {
			seconds = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
		utils.WriteJSON(w, http.StatusTooManyRequests, map[string]any{
			"error": "action rate limit exceeded", "reason_code": "action_rate_limited", "retry_after": seconds,
		})
		return
	}
	security.DefaultSafeguardTelemetry.RecordLimiterFailure()
	utils.WriteError(w, http.StatusServiceUnavailable, "mutation safeguards are temporarily unavailable")
}
