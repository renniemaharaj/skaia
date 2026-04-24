package user

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/skaia/backend/internal/auth"
	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// input validation
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	if len(req.Username) < 3 || len(req.Username) > 32 {
		utils.WriteError(w, http.StatusBadRequest, "username must be 3-32 characters")
		return
	}
	if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
		utils.WriteError(w, http.StatusBadRequest, "invalid email format")
		return
	}
	err := auth.ValidatePassword(req.Password)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	user, accessToken, refreshToken, err := h.svc.Register(&req)
	if err != nil {
		var pqErr *pq.Error
		switch {
		case strings.Contains(err.Error(), "required"):
			utils.WriteError(w, http.StatusBadRequest, err.Error())
		case errors.As(err, &pqErr) && pqErr.Code == "23505":
			utils.WriteError(w, http.StatusConflict, "user already exists")
		default:
			log.Printf("user.Handler.register: %v", err)
			utils.WriteError(w, http.StatusInternalServerError, "registration failed: "+err.Error())
		}
		return
	}

	log.Printf("auth: registered %q (@%s, id=%d)", user.DisplayName, user.Username, user.ID)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     user.ID,
		Activity:   ievents.ActUserRegistered,
		Resource:   ievents.ResUser,
		ResourceID: user.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"username": user.Username},
	})

	// Send verification email (best-effort, non-blocking).
	if h.email != nil && h.email.Configured() {
		go func(uid int64, uname, uemail string) {
			token, err := h.svc.CreateEmailVerificationToken(uid)
			if err != nil {
				log.Printf("user.Handler.register: create verification token: %v", err)
				return
			}
			html := iemail.VerifyEmailHTML(uname, token)
			if err := h.email.Send(uemail, "Verify Your Email", html); err != nil {
				log.Printf("user.Handler.register: send verification email to %s: %v", uemail, err)
			}
		}(user.ID, user.Username, user.Email)
	}

	utils.WriteJSON(w, http.StatusCreated, models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, accessToken, err := h.svc.Login(req.Email, req.Password)
	if err != nil {
		log.Printf("user.Handler.login: %v", err)
		var susp *SuspendedError
		switch {
		case errors.As(err, &susp):
			utils.WriteJSON(w, http.StatusForbidden, map[string]string{
				"error":  "user account is suspended",
				"reason": susp.Reason,
			})
		case err.Error() == "user not found" ||
			err.Error() == "invalid credentials" ||
			err.Error() == "email and password required":
			utils.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		default:
			utils.WriteError(w, http.StatusInternalServerError, "login failed")
		}
		return
	}

	// If TOTP is enabled, require a second step.
	if user.TOTPEnabled {
		// Issue a short-lived TOTP challenge token (5 min).
		totpToken, err := auth.GenerateTokenWithExpiration(
			user.ID, user.Username, user.Email, user.DisplayName,
			user.Roles, user.Permissions, 5*time.Minute,
		)
		if err != nil {
			log.Printf("user.Handler.login: generate totp challenge token: %v", err)
			// Fallback: allow login if backup codes exist
			codes, codeErr := h.svc.repo.GetTOTPBackupCodes(user.ID)
			if codeErr == nil && len(codes) > 0 {
				log.Printf("user.Handler.login: fallback to backup codes for user %d", user.ID)
				utils.WriteJSON(w, http.StatusOK, models.AuthResponse{
					RequiresTOTP: true,
					TOTPToken:    "", // No token, but allow backup code
				})
				return
			}
			utils.WriteError(w, http.StatusInternalServerError, "login failed; 2FA service unavailable and no backup codes")
			return
		}
		utils.WriteJSON(w, http.StatusOK, models.AuthResponse{
			RequiresTOTP: true,
			TOTPToken:    totpToken,
		})
		return
	}

	// If TOTP secret exists but not enabled, warn and allow login (should not happen, but fallback)
	if user.TOTPSecret != "" && !user.TOTPEnabled {
		log.Printf("user.Handler.login: WARNING: user %d has TOTP secret but 2FA not enabled. Allowing login.", user.ID)
	}

	log.Printf("auth: login %q (@%s, id=%d)", user.DisplayName, user.Username, user.ID)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     user.ID,
		Activity:   ievents.ActUserLoggedIn,
		Resource:   ievents.ResUser,
		ResourceID: user.ID,
		IP:         ievents.ClientIP(r),
	})
	utils.WriteJSON(w, http.StatusOK, models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: "",
		User:         user,
	})
}

func (h *Handler) refreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}

	accessToken, err := h.svc.RefreshToken(req.RefreshToken)
	if err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "refresh token failed: "+err.Error())
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"access_token": accessToken})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	log.Printf("auth: logout (id=%d)", userID)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActUserLoggedOut,
		Resource: ievents.ResUser,
		IP:       ievents.ClientIP(r),
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{
		"message": "logged out successfully",
		"status":  "success",
	})
}

func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	isOwn := actorID == targetID
	canManage, _ := h.svc.HasPermission(actorID, "user.manage-others")
	if !isOwn && !canManage {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !isOwn && !h.checkManagePowerLevel(w, actorID, targetID) {
		return
	}

	newPw, err := h.svc.ResetPassword(targetID)
	if err != nil {
		log.Printf("user.Handler.resetPassword: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	if h.noreply != nil {
		target, _ := h.svc.GetByID(targetID)
		displayName := ""
		if target != nil {
			displayName = target.DisplayName
			if displayName == "" {
				displayName = target.Username
			}
		}
		content := fmt.Sprintf(
			"Hello %s,\n\nYour password has been reset by an administrator.\n\nYour new temporary password is:\n\n%s\n\nPlease log in and change your password immediately.\n\n— System",
			displayName, newPw,
		)
		if err2 := h.noreply.SendNoreplyToUser(targetID, content); err2 != nil {
			log.Printf("user.Handler.resetPassword: noreply send failed: %v", err2)
		}
		if actorID != targetID {
			adminContent := fmt.Sprintf(
				"Hello,\n\nYou have reset the password for %s.\n\nThe new temporary password is:\n\n%s\n\nA copy of this reset has been sent to your inbox. Keep it secure and delete it when no longer needed.\n\n— System",
				displayName, newPw,
			)
			if err2 := h.noreply.SendNoreplyToUser(actorID, adminContent); err2 != nil {
				log.Printf("user.Handler.resetPassword: noreply copy to actor failed: %v", err2)
			}
		}
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     actorID,
		Activity:   ievents.ActUserUpdated,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
	})
	message := "Password reset and sent to user's inbox"
	if actorID != targetID {
		message = "Password reset and sent to user's inbox. A copy has also been sent to your inbox."
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"message": message})
}

func (h *Handler) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		utils.WriteError(w, http.StatusBadRequest, "email required")
		return
	}

	if h.email == nil || !h.email.Configured() {
		log.Println("user.Handler.forgotPassword: email not configured")
		utils.WriteError(w, http.StatusServiceUnavailable, "email service not configured — contact an administrator to reset your password")
		return
	}

	// Always return success to avoid email enumeration.
	defer utils.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "if the email exists, a reset link has been sent",
	})

	user, err := h.svc.GetByEmail(req.Email)
	if err != nil {
		return // user not found — silent
	}

	token, err := h.svc.CreatePasswordResetToken(user.ID)
	if err != nil {
		log.Printf("user.Handler.forgotPassword: create token: %v", err)
		return
	}

	go func(uname, uemail, tok string) {
		html := iemail.PasswordResetHTML(uname, tok)
		if err := h.email.Send(uemail, "Reset Your Password", html); err != nil {
			log.Printf("user.Handler.forgotPassword: send email to %s: %v", uemail, err)
		}
	}(user.Username, user.Email, token)
}

func (h *Handler) resetPasswordWithToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Token == "" || req.NewPassword == "" {
		utils.WriteError(w, http.StatusBadRequest, "token and new_password required")
		return
	}

	if err := h.svc.ResetPasswordWithToken(req.Token, req.NewPassword); err != nil {
		log.Printf("user.Handler.resetPasswordWithToken: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Notify user via email (best-effort).
	if h.email != nil && h.email.Configured() {
		go func(tok string) {
			u, err := h.svc.GetPasswordResetTokenUser(tok)
			if err != nil {
				return
			}
			html := iemail.PasswordChangedHTML(u.Username)
			_ = h.email.Send(u.Email, "Password Changed", html)
		}(req.Token)
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "password reset successfully"})
}

func (h *Handler) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		utils.WriteError(w, http.StatusBadRequest, "verification token required")
		return
	}

	if err := h.svc.VerifyEmail(req.Token); err != nil {
		log.Printf("user.Handler.verifyEmail: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "email verified"})
}

func (h *Handler) resendVerification(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.svc.GetByID(userID)
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

	token, err := h.svc.ResendVerificationToken(userID)
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
