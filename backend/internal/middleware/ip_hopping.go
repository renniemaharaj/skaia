package middleware

import (
	"net/http"
	"strings"
	"sync"

	"github.com/go-chi/httprate"
	"github.com/skaia/backend/internal/auth"
	ijwt "github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/utils"
)

var lastIPs sync.Map // map[int64]string

// IPHoppingMiddleware detects if an authenticated user's IP changes.
// If it does, it requires them to solve an MFA challenge.
func IPHoppingMiddleware(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := utils.UserIDFromCtx(r)
			if !ok {
				authHeader := r.Header.Get("Authorization")
				if authHeader != "" {
					parts := strings.SplitN(authHeader, " ", 2)
					if len(parts) == 2 && parts[0] == "Bearer" {
						if claims, err := ijwt.ValidateToken(parts[1]); err == nil {
							userID = claims.UserID
							ok = true
						}
					}
				}
			}

			if ok {
				ip, _ := httprate.KeyByRealIP(r)
				if lastIP, loaded := lastIPs.Load(userID); loaded {
					if lastIP.(string) != ip {
						_, enabled, _ := authSvc.GetTOTPEnabled(r.Context(), userID)
						if enabled {
							_ = authSvc.SetMFARequired(r.Context(), userID, true)
						}
						lastIPs.Store(userID, ip)
					}
				} else {
					lastIPs.Store(userID, ip)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
