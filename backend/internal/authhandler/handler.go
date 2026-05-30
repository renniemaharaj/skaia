package authhandler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/auth"
	mw "github.com/skaia/backend/internal/middleware"
)

type Handler struct {
	authHandler *auth.Handler
}

func NewHandler(authHandler *auth.Handler) *Handler {
	return &Handler{authHandler: authHandler}
}

// RegisterRoutes mounts the /auth routes on r.
// Mount registers all user-domain routes onto r.
func (h *Handler) Mount(r chi.Router, jwt, optJWT func(http.Handler) http.Handler) {
	r.Route("/auth", func(r chi.Router) {
		r.With(mw.AuthLimitMiddleware()).Post("/register", h.authHandler.Register)
		r.With(mw.AuthLimitMiddleware()).Post("/login", h.authHandler.Login)
		r.With(mw.AuthLimitMiddleware()).Post("/login/totp", h.authHandler.LoginTOTP)
		r.With(mw.AuthLimitMiddleware()).Post("/refresh", h.authHandler.RefreshToken)
		r.With(jwt).Post("/logout", h.authHandler.Logout)

		// Email verification (public — token-authenticated)
		r.With(mw.AuthLimitMiddleware()).Post("/verify-email", h.authHandler.VerifyEmail)
		r.With(jwt).Post("/resend-verification", h.authHandler.ResendVerification)

		// Password recovery (public — no auth required)
		r.With(mw.AuthLimitMiddleware()).Post("/forgot-password", h.authHandler.ForgotPassword)
		r.With(mw.AuthLimitMiddleware()).Post("/reset-password", h.authHandler.ResetPasswordWithToken)

		// 2FA / TOTP (requires auth)
		r.With(jwt).Post("/totp/setup", h.authHandler.TOTPSetup)
		r.With(jwt).Post("/totp/enable", h.authHandler.TOTPEnable)
		r.With(jwt).Post("/totp/disable", h.authHandler.TOTPDisable)
		r.With(jwt).Post("/mfa-challenge", func(w http.ResponseWriter, r *http.Request) {
			// Handled by MFARequiredMiddleware, but defined here as a registered route.
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success"}`))
		})
		// Expose TOTP status for the authenticated user and admin queries
		r.With(jwt).Get("/totp", h.authHandler.TOTPStatus)
		r.With(jwt).Get("/totp/{id}", h.authHandler.AdminTOTPStatus)

		// Admin user management (requires user.manage-others permission)
		r.With(jwt).Post("/admin/{id}/reset-password", h.authHandler.AdminResetPassword)

		// Admin TOTP management (requires user.manage-others permission)
		r.With(jwt).Post("/admin/totp/{id}/enable", h.authHandler.AdminEnableTOTP)
		r.With(jwt).Post("/admin/totp/{id}/disable", h.authHandler.AdminDisableTOTP)
		r.With(jwt).Post("/admin/totp/{id}/challenge", h.authHandler.AdminTriggerMFAChallenge)

		r.With(jwt).Post("/admin/totp/{id}/generate-backup-codes", h.authHandler.AdminGenerateBackupCodes)
	})
}
