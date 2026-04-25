package user

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/skaia/backend/internal/auth"
	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Admin: Enable TOTP for another user (no password required, must have permission and power level)
func (h *Handler) adminEnableTOTP(w http.ResponseWriter, r *http.Request) {
	adminID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if adminID == targetID {
		utils.WriteError(w, http.StatusBadRequest, "use self-service endpoint for your own account")
		return
	}
	if !utils.CheckPerm(w, h.svc, adminID, "user.manage-others") {
		return
	}
	if !h.checkManagePowerLevel(w, adminID, targetID) {
		return
	}

	var req struct {
		Secret string `json:"secret"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	backupCodes, err := h.svc.AdminEnableTOTP(targetID, req.Secret, req.Code)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "2fa enabled (admin)",
		"backup_codes": backupCodes,
	})
}

// Admin: Disable TOTP for another user (no password required, must have permission and power level)
func (h *Handler) adminDisableTOTP(w http.ResponseWriter, r *http.Request) {
	adminID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if adminID == targetID {
		utils.WriteError(w, http.StatusBadRequest, "use self-service endpoint for your own account")
		return
	}
	if !utils.CheckPerm(w, h.svc, adminID, "user.manage-others") {
		return
	}
	if !h.checkManagePowerLevel(w, adminID, targetID) {
		return
	}

	err = h.svc.AdminDisableTOTP(targetID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "2fa disabled (admin)"})
}

func (h *Handler) loginTOTP(w http.ResponseWriter, r *http.Request) {
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

	claims, err := auth.ValidateToken(req.TOTPToken)
	if err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "invalid or expired TOTP token")
		return
	}

	user, err := h.svc.GetByID(claims.UserID)
	if err != nil {
		utils.WriteError(w, http.StatusUnauthorized, "user not found")
		return
	}

	if !user.TOTPEnabled || user.TOTPSecret == "" {
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
		// Validate TOTP code.
		valid = validateTOTPCode(user.TOTPSecret, req.TOTPCode)
	} else {
		utils.WriteError(w, http.StatusBadRequest, "totp_code or backup_code required")
		return
	}

	if !valid {
		utils.WriteError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}

	// Issue full access token.
	accessToken, err := auth.GenerateTokenWithPermissions(
		user.ID, user.Username, user.Email, user.DisplayName, user.Roles, user.Permissions,
	)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "token generation failed")
		return
	}
	user.PasswordHash = ""
	user.TOTPSecret = ""

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

func (h *Handler) totpSetup(w http.ResponseWriter, r *http.Request) {
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
	if user.TOTPEnabled {
		utils.WriteError(w, http.StatusBadRequest, "2FA is already enabled")
		return
	}

	secret, uri, err := generateTOTPSecret(user.Email)
	if err != nil {
		log.Printf("user.Handler.totpSetup: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to generate TOTP secret")
		return
	}

	if err := h.svc.SetTOTPSecret(userID, secret); err != nil {
		log.Printf("user.Handler.totpSetup: save secret: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to save TOTP secret")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{
		"secret":  secret,
		"otpauth": uri,
		"qr_uri":  uri,
	})
}

func (h *Handler) totpEnable(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		utils.WriteError(w, http.StatusBadRequest, "verification code required")
		return
	}

	user, err := h.svc.GetByID(userID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	if user.TOTPEnabled {
		utils.WriteError(w, http.StatusBadRequest, "2FA is already enabled")
		return
	}
	if user.TOTPSecret == "" {
		utils.WriteError(w, http.StatusBadRequest, "call /auth/totp/setup first")
		return
	}

	if !validateTOTPCode(user.TOTPSecret, req.Code) {
		utils.WriteError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}

	backupCodes, err := h.svc.EnableTOTP(userID)
	if err != nil {
		log.Printf("user.Handler.totpEnable: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to enable 2FA")
		return
	}

	// Notify via email.
	if h.email != nil && h.email.Configured() {
		go func(uname, uemail string) {
			html := iemail.TOTPEnabledHTML(uname)
			_ = h.email.Send(uemail, "Two-Factor Authentication Enabled", html)
		}(user.Username, user.Email)
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "2fa enabled",
		"backup_codes": backupCodes,
	})
}

func (h *Handler) totpDisable(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		utils.WriteError(w, http.StatusBadRequest, "current password required to disable 2FA")
		return
	}

	user, err := h.svc.GetByID(userID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	if !auth.ComparePassword(user.PasswordHash, req.Password) {
		utils.WriteError(w, http.StatusUnauthorized, "invalid password")
		return
	}

	if err := h.svc.DisableTOTP(userID); err != nil {
		log.Printf("user.Handler.totpDisable: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to disable 2FA")
		return
	}

	// Notify via email.
	if h.email != nil && h.email.Configured() {
		go func(uname, uemail string) {
			html := iemail.TOTPDisabledHTML(uname)
			_ = h.email.Send(uemail, "Two-Factor Authentication Disabled", html)
		}(user.Username, user.Email)
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "2fa disabled"})
}
