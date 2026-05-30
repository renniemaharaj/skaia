package session

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

// Handler owns the HTTP layer for session endpoints.
type Handler struct {
	svc *Service
}

// NewHandler returns a Handler backed by the given session Service.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Mount registers session routes on the given router.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/session", func(r chi.Router) {
		// Public: frontend fetches the Turnstile site key
		r.Get("/turnstile-config", h.GetTurnstileConfig)

		// Authenticated routes
		r.With(jwt).Get("/", h.ListSessions)
		r.With(jwt).Delete("/{id}", h.DeleteSession)
		r.With(jwt).Post("/verify-turnstile", h.VerifyTurnstile)
	})
}

// GetTurnstileConfig returns the public Turnstile site_key.
func (h *Handler) GetTurnstileConfig(w http.ResponseWriter, r *http.Request) {
	cfg := h.svc.GetTurnstileConfig()
	if cfg == nil {
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"enabled":  false,
			"site_key": "",
		})
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":  true,
		"site_key": cfg.SiteKey,
	})
}

// ListSessions returns all active sessions for the authenticated user.
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessions, err := h.svc.GetUserSessions(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"sessions": sessions,
	})
}

// DeleteSession removes a specific session for the authenticated user.
func (h *Handler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		utils.WriteError(w, http.StatusBadRequest, "session id required")
		return
	}

	// Verify session belongs to user
	sess, err := h.svc.repo.GetByID(r.Context(), sessionID)
	if err != nil || sess.UserID != userID {
		utils.WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	if err := h.svc.DeleteSession(r.Context(), sessionID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete session")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

// VerifyTurnstile handles step-up authentication via Cloudflare Turnstile.
func (h *Handler) VerifyTurnstile(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req TurnstileVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Token == "" || req.SessionID == "" {
		utils.WriteError(w, http.StatusBadRequest, "token and session_id required")
		return
	}

	// Verify session belongs to user
	sess, err := h.svc.repo.GetByID(r.Context(), req.SessionID)
	if err != nil || sess.UserID != userID {
		utils.WriteError(w, http.StatusNotFound, "session not found")
		return
	}

	clientIP := RealClientIP(r)
	if err := h.svc.VerifyTurnstileToken(r.Context(), req.SessionID, req.Token, clientIP); err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "turnstile verification failed")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "success"})
}
