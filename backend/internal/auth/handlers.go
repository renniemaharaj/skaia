package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/lib/pq"

	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	iinbox "github.com/skaia/backend/internal/inbox"
	"github.com/skaia/backend/internal/jwt"
	ijwt "github.com/skaia/backend/internal/jwt"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// SuspendedError is returned by Login when the account is suspended.
type SuspendedError struct {
	Reason string
}

func (e *SuspendedError) Error() string {
	return "account suspended: " + e.Reason
}

// Handler owns the HTTP layer for the user domain.
type Handler struct {
	svc        *Service
	hub        *ws.Hub
	dispatcher *ievents.Dispatcher
	email      *iemail.Sender

	userSvc  *iuser.Service
	inboxSvc *iinbox.Service
}

// NewHandler returns a Handler backed by the given Service and WebSocket Hub.
func NewHandler(svc *Service, hub *ws.Hub, dispatcher *ievents.Dispatcher, emailSender *iemail.Sender, inboxSvc *iinbox.Service, userSvc *iuser.Service) *Handler {

	return &Handler{svc: svc, hub: hub, dispatcher: dispatcher, email: emailSender, inboxSvc: inboxSvc, userSvc: userSvc}
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
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
	err := ValidatePassword(req.Password)
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

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
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
	if _, enabled, _ := h.svc.GetTOTPEnabled(user.ID); enabled {
		// Issue a short-lived TOTP challenge token (5 min).
		totpToken, err := ijwt.GenerateTokenWithExpiration(
			user.ID, user.Username, user.Email, user.DisplayName,
			user.Roles, user.Permissions, 5*time.Minute,
		)
		if err != nil {
			log.Printf("user.Handler.login: generate totp challenge token: %v", err)
			// Fallback: allow login if backup codes exist
			codes, codeErr := h.svc.repo.GetBackupCodes(context.Background(), user.ID)
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
	if totpSecret, enabled, _ := h.svc.GetTOTPEnabled(user.ID); totpSecret != "" && !enabled {
		log.Printf("user.Handler.login: WARNING: user %d has TOTP secret but 2FA not enabled. Allowing login.", user.ID)
	}

	// Ensure the returned user has the correct TOTP flag and propagate the
	// hydrated user so the UI updates immediately.
	if totpSecret, enabled, _ := h.svc.GetTOTPEnabled(user.ID); totpSecret != "" || enabled {
		user.TOTPEnabled = enabled
	}
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(user.ID)
	}
	if h.hub != nil {
		go h.hub.PropagateUser(user.ID, map[string]interface{}{"user": user, "new_token": accessToken})
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

func (h *Handler) RefreshToken(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := utils.ParseUserIdFromParam(r, "id")
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

	if !isOwn && !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}

	newPw, err := h.svc.ResetPassword(targetID)
	if err != nil {
		log.Printf("user.Handler.resetPassword: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

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
	if err2 := h.inboxSvc.SendNoreplyToUser(targetID, content); err2 != nil {
		log.Printf("user.Handler.resetPassword: noreply send failed: %v", err2)
	}
	if actorID != targetID {
		adminContent := fmt.Sprintf(
			"Hello,\n\nYou have reset the password for %s.\n\nThe new temporary password is:\n\n%s\n\nA copy of this reset has been sent to your inbox. Keep it secure and delete it when no longer needed.\n\n— System",
			displayName, newPw,
		)
		if err2 := h.inboxSvc.SendNoreplyToUser(actorID, adminContent); err2 != nil {
			log.Printf("user.Handler.resetPassword: noreply copy to actor failed: %v", err2)
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

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) ResetPasswordWithToken(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) ResendVerification(w http.ResponseWriter, r *http.Request) {
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

// TOTP Handlers
func (h *Handler) LoginTOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TOTPToken  string `json:"totp_token"`
		TOTPCode   string `json:"totp_code"`
		BackupCode string `json:"backup_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TOTPToken == "" {
		utils.WriteError(w, http.StatusBadRequest, "totp_token required")
		return
	}

	claims, err := jwt.ValidateToken(req.TOTPToken)
	if err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "invalid or expired TOTP token")
		return
	}

	user, err := h.svc.GetByID(claims.UserID)
	if err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "user not found")
		return
	}

	_, enabled, err := h.svc.GetTOTPEnabled(user.ID)
	if !enabled || err != nil {
		utils.WriteError(w, http.StatusBadRequest, "2FA is not enabled for this account. Please contact support to regain access.")
		return
	}

	var valid bool
	if req.BackupCode != "" {
		// Try backup code.
		valid, err = h.svc.ValidateTOTPBackupCode(user.ID, req.BackupCode)
		if err != nil {
			log.Printf("user.Handler.loginTOTP: backup code validation: %v", err)
			utils.WriteError(w, http.StatusInternalServerError, "verification failed")
			return
		}
	} else if req.TOTPCode != "" {
		// Validate TOTP code using service method.
		valid, err = h.svc.VerifyTOTP(user.ID, req.TOTPCode)
		if err != nil {
			utils.WriteError(w, http.StatusUnauthorized, "invalid verification code")
			return
		}
	} else {
		utils.WriteError(w, http.StatusBadRequest, "totp_code or backup_code required")
		return
	}

	if !valid {
		utils.WriteError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}

	// Issue full access token.
	accessToken, err := jwt.GenerateTokenWithPermissions(
		user.ID, user.Username, user.Email, user.DisplayName, user.Roles, user.Permissions,
	)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "token generation failed")
		return
	}

	user.TOTPEnabled = enabled // include TOTP status in response
	// Invalidate cache and propagate hydrated user so clients see updated totp state.
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(user.ID)
	}
	if h.hub != nil {
		go h.hub.PropagateUser(user.ID, map[string]interface{}{"user": user, "new_token": accessToken})
	}

	log.Printf("auth: login+2fa %q (@%s, id=%d)", user.DisplayName, user.Username, user.ID)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     user.ID,
		Activity:   ievents.ActUserLoggedIn,
		Resource:   ievents.ResUser,
		ResourceID: user.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"2fa": true},
	})
	utils.WriteJSON(w, http.StatusOK, models.AuthResponse{
		AccessToken: accessToken,
		User:        user,
	})
}

func (h *Handler) TOTPSetup(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Generate TOTP secret
	secret, err := h.svc.GenerateTOTPSecret(userID)
	if err != nil {
		log.Printf("auth.Handler.TOTPSetup: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to generate TOTP secret")
		return
	}
	// Get username for otpauth URI
	user, err := h.userSvc.GetByID(userID)
	if err != nil {
		log.Printf("auth.Handler.TOTPSetup: failed to get user: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to get user info")
		return
	}
	issuer := "Skaia"
	otpauth := "otpauth://totp/" + issuer + ":" + user.Username + "?secret=" + secret + "&issuer=" + issuer + "&algorithm=SHA1&digits=6&period=30"
	utils.WriteJSON(w, http.StatusOK, map[string]string{
		"secret":  secret,
		"otpauth": otpauth,
		"qr_uri":  otpauth,
	})

	// Propagate user so UI clients refresh (authoritative TOTP state comes from auth)
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(userID)
		if updatedUser, err := h.userSvc.GetByID(userID); err == nil {
			if _, enabled, err := h.svc.GetTOTPEnabled(userID); err == nil {
				updatedUser.TOTPEnabled = enabled
			} else {
				log.Printf("auth.Handler.TOTPSetup: failed to load totp status for user %d: %v", userID, err)
			}
			if h.hub != nil {
				go h.hub.PropagateUser(userID, map[string]interface{}{"user": updatedUser})
			}
		} else {
			log.Printf("auth.Handler.TOTPSetup: failed to refresh user %d: %v", userID, err)
		}
	}
}

// TOTPStatus returns whether TOTP is enabled for the authenticated user.
func (h *Handler) TOTPStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	_, enabled, err := h.svc.GetTOTPEnabled(userID)
	if err != nil {
		log.Printf("auth.Handler.TOTPStatus: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to get TOTP status")
		return
	}
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(userID)
		if updatedUser, err := h.userSvc.GetByID(userID); err == nil {
			updatedUser.TOTPEnabled = enabled
			if h.hub != nil {
				go h.hub.PropagateUser(userID, map[string]interface{}{"user": updatedUser})
			}
		} else {
			log.Printf("auth.Handler.TOTPStatus: failed to refresh user %d: %v", userID, err)
		}
	}
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
}

// AdminTOTPStatus returns whether TOTP is enabled for another user (admin only).
func (h *Handler) AdminTOTPStatus(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	// Permission check
	if ok, _ := h.svc.HasPermission(actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	_, enabled, err := h.svc.GetTOTPEnabled(targetID)
	if err != nil {
		log.Printf("auth.Handler.AdminTOTPStatus: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to get TOTP status")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
}

func (h *Handler) TOTPEnable(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		utils.WriteError(w, http.StatusBadRequest, "code required")
		return
	}
	codes, err := h.svc.EnableTOTP(userID, req.Code)
	if err != nil {
		log.Printf("auth.Handler.totpEnable: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(userID)
		if updatedUser, err := h.userSvc.GetByID(userID); err == nil {
			if _, enabled, err := h.svc.GetTOTPEnabled(userID); err == nil {
				updatedUser.TOTPEnabled = enabled
			} else {
				log.Printf("auth.Handler.TOTPEnable: failed to load totp status for user %d: %v", userID, err)
			}
			if h.hub != nil {
				go h.hub.PropagateUser(userID, map[string]interface{}{"user": updatedUser})
			}
		} else {
			log.Printf("auth.Handler.TOTPEnable: failed to refresh user %d: %v", userID, err)
		}
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "TOTP enabled",
		"backup_codes": codes,
	})
}

func (h *Handler) TOTPDisable(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		utils.WriteError(w, http.StatusBadRequest, "password required")
		return
	}
	err := h.svc.DisableTOTP(userID, req.Password)
	if err != nil {
		log.Printf("auth.Handler.TOTPDisable: %v", err)
		if errors.Is(err, ErrInvalidPassword) {
			utils.WriteError(w, http.StatusUnauthorized, "invalid password")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(userID)
		if updatedUser, err := h.userSvc.GetByID(userID); err == nil {
			if _, enabled, err := h.svc.GetTOTPEnabled(userID); err == nil {
				updatedUser.TOTPEnabled = enabled
			} else {
				log.Printf("auth.Handler.TOTPDisable: failed to load totp status for user %d: %v", userID, err)
			}
			if h.hub != nil {
				go h.hub.PropagateUser(userID, map[string]interface{}{"user": updatedUser})
			}
		} else {
			log.Printf("auth.Handler.TOTPDisable: failed to refresh user %d: %v", userID, err)
		}
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "TOTP disabled"})
}

// AdminEnableTOTP allows an admin to enable TOTP for another user without requiring a password.
func (h *Handler) AdminEnableTOTP(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	// Permission check
	if ok, _ := h.svc.HasPermission(actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	var req struct {
		Secret string `json:"secret"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Secret == "" || req.Code == "" {
		utils.WriteError(w, http.StatusBadRequest, "secret and code required")
		return
	}
	// EnableTOTPWithSecret enables TOTP with a given secret and code (for admin use).
	codes, err := h.svc.AdminEnableTOTP(targetID, req.Secret, req.Code)
	if err != nil {
		log.Printf("auth.Handler.AdminEnableTOTP: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(targetID)
		if updatedUser, err := h.userSvc.GetByID(targetID); err == nil {
			if _, enabled, err := h.svc.GetTOTPEnabled(targetID); err == nil {
				updatedUser.TOTPEnabled = enabled
			} else {
				log.Printf("auth.Handler.AdminEnableTOTP: failed to load totp status for user %d: %v", targetID, err)
			}
			if h.hub != nil {
				go h.hub.PropagateUser(targetID, map[string]interface{}{"user": updatedUser})
			}
		} else {
			log.Printf("auth.Handler.AdminEnableTOTP: failed to refresh user %d: %v", targetID, err)
		}
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "TOTP enabled",
		"backup_codes": codes,
	})
}

// AdminDisableTOTP allows an admin to disable TOTP for another user without requiring a password.
func (h *Handler) AdminDisableTOTP(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	// Permission check
	if ok, _ := h.svc.HasPermission(actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	// Admin disable does not require password — call service method with empty password as sentinel.
	if err := h.svc.AdminDisableTOTP(targetID); err != nil {
		log.Printf("auth.Handler.AdminDisableTOTP: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h.userSvc != nil {
		h.userSvc.InvalidateUser(targetID)
		if updatedUser, err := h.userSvc.GetByID(targetID); err == nil {
			if _, enabled, err := h.svc.GetTOTPEnabled(targetID); err == nil {
				updatedUser.TOTPEnabled = enabled
			} else {
				log.Printf("auth.Handler.AdminDisableTOTP: failed to load totp status for user %d: %v", targetID, err)
			}
			if h.hub != nil {
				go h.hub.PropagateUser(targetID, map[string]interface{}{"user": updatedUser})
			}
		} else {
			log.Printf("auth.Handler.AdminDisableTOTP: failed to refresh user %d: %v", targetID, err)
		}
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "TOTP disabled"})
}

func (h *Handler) AdminGenerateBackupCodes(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	// Permission check
	if ok, _ := h.svc.HasPermission(actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	codes, err := h.svc.AdminGenerateBackupCodes(targetID)
	if err != nil {
		log.Printf("auth.Handler.AdminGenerateBackupCodes: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to generate backup codes")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"backup_codes": codes,
	})
}
