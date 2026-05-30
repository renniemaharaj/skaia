package auth

import (
	"encoding/json"
	"log"
	"net/http"

	iemail "github.com/skaia/backend/internal/email"
	"github.com/skaia/backend/internal/utils"
)

func (h *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		utils.WriteError(w, http.StatusBadRequest, "verification token required")
		return
	}

	if err := h.svc.VerifyEmail(r.Context(), req.Token); err != nil {
		log.Printf("user.Handler.verifyEmail: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "email verified"})
}

func (h *Handler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.svc.GetByID(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	if user.EmailVerified {
		utils.WriteError(w, http.StatusBadRequest, "email already verified")
		return
	}
	if h.email == nil || !h.email.Configured() {
		utils.WriteError(w, http.StatusServiceUnavailable, "email service not configured")
		return
	}

	token, err := h.svc.ResendVerificationToken(r.Context(), userID)
	if err != nil {
		log.Printf("user.Handler.resendVerification: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create verification token")
		return
	}

	go func(uname, uemail, tok string) {
		html := iemail.VerifyEmailHTML(uname, tok)
		if err := h.email.Send(uemail, "Verify Your Email", html); err != nil {
			log.Printf("user.Handler.resendVerification: send email to %s: %v", uemail, err)
		}
	}(user.Username, user.Email, token)

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "verification email sent"})
}
