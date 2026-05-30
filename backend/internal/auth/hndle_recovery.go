package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
)

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

	user, err := h.svc.GetByEmail(r.Context(), req.Email)
	if err != nil {
		return // user not found — silent
	}

	token, err := h.svc.CreatePasswordResetToken(r.Context(), user.ID)
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
	canManage, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others")
	if !isOwn && !canManage {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	if !isOwn && !h.userSvc.CheckManagePowerLevel(w, actorID, targetID) {
		return
	}

	newPw, err := h.svc.ResetPassword(r.Context(), targetID)
	if err != nil {
		log.Printf("user.Handler.resetPassword: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	target, _ := h.svc.GetByID(r.Context(), targetID)
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

	if err := h.svc.ResetPasswordWithToken(r.Context(), req.Token, req.NewPassword); err != nil {
		log.Printf("user.Handler.resetPasswordWithToken: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Notify user via email (best-effort).
	if h.email != nil && h.email.Configured() {
		go func(tok string) {
			u, err := h.svc.GetPasswordResetTokenUser(r.Context(), tok)
			if err != nil {
				return
			}
			html := iemail.PasswordChangedHTML(u.Username)
			_ = h.email.Send(u.Email, "Password Changed", html)
		}(req.Token)
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "password reset successfully"})
}

func (h *Handler) AdminResetPassword(w http.ResponseWriter, r *http.Request) {
	targetID, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Permission check
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	newPw, err := h.svc.ResetPassword(r.Context(), targetID)
	if err != nil {
		log.Printf("user.Handler.adminResetPassword: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	target, _ := h.svc.GetByID(r.Context(), targetID)
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
		log.Printf("user.Handler.adminResetPassword: noreply send failed: %v", err2)
	}

	content2 := fmt.Sprintf(
		"Hello,\n\nYou have reset the password for %s.\n\nThe new temporary password is:\n\n%s\n\nA copy of this reset has been sent to your inbox. Keep it secure and delete it when no longer needed.\n\n— System",
		displayName, newPw,
	)

	// Notify all other admins (best-effort).
	if err2 := h.inboxSvc.SendNoreplyToUser(actorID, content2); err2 != nil {
		log.Printf("user.Handler.adminResetPassword: noreply copy to actor failed: %v", err2)
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     targetID,
		Activity:   ievents.ActUserUpdated,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"message": "Password reset and sent to user's inbox"})
}
