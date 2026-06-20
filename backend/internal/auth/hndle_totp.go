package auth

import (
	"encoding/json"
	"errors"
	log "github.com/skaia/backend/internal/syslog"
	"net/http"

	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

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

	user, err := h.svc.GetByID(r.Context(), claims.UserID)
	if err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "user not found")
		return
	}

	_, enabled, err := h.svc.GetTOTPEnabled(r.Context(), user.ID)
	if !enabled || err != nil {
		utils.WriteError(w, http.StatusBadRequest, "2FA is not enabled for this account. Please contact support to regain access.")
		return
	}

	var valid bool
	if req.BackupCode != "" {
		// Try backup code.
		valid, err = h.svc.ValidateTOTPBackupCode(r.Context(), user.ID, req.BackupCode)
		if err != nil {
			log.Printf("user.Handler.loginTOTP: backup code validation: %v", err)
			utils.WriteError(w, http.StatusInternalServerError, "verification failed")
			return
		}
	} else if req.TOTPCode != "" {
		// Validate TOTP code using service method.
		valid, err = h.svc.VerifyTOTP(r.Context(), user.ID, req.TOTPCode)
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

	// Reset MFA challenge required state in DB for the session
	if err := h.svc.SetMFARequired(r.Context(), user.ID, false); err != nil {
		log.Printf("auth: failed to reset MFA challenge status: %v", err)
	}

	// Issue full access token.
	accessToken, err := jwt.GenerateTokenWithPermissions(
		user.ID, user.Username, user.Email, user.DisplayName, user.Roles, user.Permissions,
	)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "token generation failed")
		return
	}

	h.propagateAuthUser(r.Context(), user.ID, map[string]interface{}{"new_token": accessToken})

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
		User:        models.NewAuthUser(user, enabled),
	})
}

func (h *Handler) TOTPSetup(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Generate TOTP secret
	secret, err := h.svc.GenerateTOTPSecret(r.Context(), userID)
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

	h.propagateAuthUser(r.Context(), userID, nil)
}

// TOTPStatus returns whether TOTP is enabled for the authenticated user.
func (h *Handler) TOTPStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	_, enabled, err := h.svc.GetTOTPEnabled(r.Context(), userID)
	if err != nil {
		log.Printf("auth.Handler.TOTPStatus: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to get TOTP status")
		return
	}
	h.propagateAuthUser(r.Context(), userID, nil)
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
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	_, enabled, err := h.svc.GetTOTPEnabled(r.Context(), targetID)
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
	codes, err := h.svc.EnableTOTP(r.Context(), userID, req.Code)
	if err != nil {
		log.Printf("auth.Handler.totpEnable: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Since the user successfully provided a valid TOTP code to set it up,
	// clear any pending MFA requirement for their current session.
	_ = h.svc.SetMFARequired(r.Context(), userID, false)

	h.propagateAuthUser(r.Context(), userID, nil)
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "TOTP enabled",
		"backup_codes": codes,
	})
}

// AdminTriggerMFAChallenge allows an admin to trigger an MFA challenge for another user.
func (h *Handler) AdminTriggerMFAChallenge(w http.ResponseWriter, r *http.Request) {
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
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	// Verify target user actually has TOTP enabled
	_, enabled, err := h.svc.GetTOTPEnabled(r.Context(), targetID)
	if err != nil || !enabled {
		utils.WriteError(w, http.StatusBadRequest, "user does not have a method like TOTP enabled")
		return
	}

	// Set MFA required in the DB
	if err := h.svc.RequireMFA(r.Context(), targetID, MFAReasonSuspiciousActivity, ""); err != nil {
		log.Printf("auth.Handler.AdminTriggerMFAChallenge: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to trigger challenge")
		return
	}

	// Dispatch websocket event to the target user via propagateAuthUser
	h.propagateAuthUser(r.Context(), targetID, map[string]interface{}{
		"mfa_challenge_triggered": true,
		"mfa_reason_code":         MFAReasonSuspiciousActivity,
	})

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "challenge triggered"})
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
	err := h.svc.DisableTOTP(r.Context(), userID, req.Password)
	if err != nil {
		log.Printf("auth.Handler.TOTPDisable: %v", err)
		if errors.Is(err, ErrInvalidPassword) {
			utils.WriteError(w, http.StatusUnauthorized, "invalid password")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.propagateAuthUser(r.Context(), userID, nil)
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
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
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
	codes, err := h.svc.AdminEnableTOTP(r.Context(), targetID, req.Secret, req.Code)
	if err != nil {
		log.Printf("auth.Handler.AdminEnableTOTP: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.propagateAuthUser(r.Context(), targetID, nil)
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
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	// Admin disable does not require password - call service method with empty password as sentinel.
	if err := h.svc.AdminDisableTOTP(r.Context(), targetID); err != nil {
		log.Printf("auth.Handler.AdminDisableTOTP: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.propagateAuthUser(r.Context(), targetID, nil)
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
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	// Optional power-level guard
	if !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}
	codes, err := h.svc.AdminGenerateBackupCodes(r.Context(), targetID)
	if err != nil {
		log.Printf("auth.Handler.AdminGenerateBackupCodes: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to generate backup codes")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"backup_codes": codes,
	})
}
