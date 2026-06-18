package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email          string `json:"email"`
		GuestSessionID string `json:"guest_session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		utils.WriteError(w, http.StatusBadRequest, "email required")
		return
	}

	recoveryReq, alreadyPending, err := h.svc.CreateRecoveryRequest(r.Context(), req.Email, ievents.ClientIP(r), req.GuestSessionID)
	if err != nil {
		if errors.Is(err, ErrRecoveryRequestRateLimited) {
			utils.WriteError(w, http.StatusTooManyRequests, err.Error())
			return
		}
		if errors.Is(err, ErrRecoveryRequestAlreadyPending) {
			utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
				"status":  "already_pending",
				"message": err.Error(),
				"request": recoveryReq,
			})
			return
		}
		log.Printf("user.Handler.forgotPassword: create recovery request: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to request account recovery")
		return
	}
	if recoveryReq != nil && !alreadyPending {
		h.broadcastRecoveryRequest("created", recoveryReq)
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "created",
			"message": "Your recovery request is pending administrator review.",
			"request": recoveryReq,
		})
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "if the email exists, an administrator can review the recovery request",
	})
}

func (h *Handler) ExpireRecoveryRequestsForGuestSession(guestSessionID string) {
	expired := h.svc.ExpireRecoveryRequestsByGuestSession(context.Background(), guestSessionID)
	for _, req := range expired {
		h.broadcastRecoveryRequest("expired", req)
	}
}

func (h *Handler) broadcastRecoveryRequest(action string, data interface{}) {
	if h.hub == nil {
		return
	}
	h.hub.BroadcastRecoveryRequest(data, action)
}

func (h *Handler) ListRecoveryRequests(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	utils.WriteJSON(w, http.StatusOK, h.svc.ListRecoveryRequests(r.Context()))
}

func (h *Handler) AcceptRecoveryRequest(w http.ResponseWriter, r *http.Request) {
	h.resolveRecoveryRequest(w, r, true)
}

func (h *Handler) RejectRecoveryRequest(w http.ResponseWriter, r *http.Request) {
	h.resolveRecoveryRequest(w, r, false)
}

func (h *Handler) resolveRecoveryRequest(w http.ResponseWriter, r *http.Request, accept bool) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if ok, _ := h.svc.HasPermission(r.Context(), actorID, "user.manage-others"); !ok {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	requestID := chi.URLParam(r, "requestID")
	req, err := h.svc.GetRecoveryRequest(r.Context(), requestID)
	if err != nil {
		switch {
		case errors.Is(err, ErrRecoveryRequestExpired):
			utils.WriteError(w, http.StatusGone, "recovery request expired")
		case errors.Is(err, ErrRecoveryRequestNotFound):
			utils.WriteError(w, http.StatusNotFound, "recovery request not found")
		default:
			utils.WriteError(w, http.StatusInternalServerError, "failed to resolve recovery request")
		}
		return
	}

	if !h.userSvc.CheckManagePowerLevel(w, actorID, req.UserID) {
		return
	}

	status := "rejected"
	action := "reject"
	if accept {
		status = "accepted"
		action = "accept"
	}
	if err := h.svc.RequireRecoveryResolutionChallenge(r.Context(), actorID, requestID, action); err != nil {
		switch {
		case errors.Is(err, ErrRecoveryChallengeMethodRequired):
			utils.WriteError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, ErrRecoveryChallengeRequired):
			utils.WriteError(w, http.StatusUnauthorized, err.Error())
		default:
			utils.WriteError(w, http.StatusInternalServerError, "failed to prepare MFA challenge")
		}
		return
	}
	req, err = h.svc.ResolveRecoveryRequest(r.Context(), requestID, status)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "recovery request not found")
		return
	}
	h.svc.ConsumeRecoveryResolutionChallenge(actorID, requestID, action)

	if !accept {
		h.dispatcher.Dispatch(ievents.Job{
			UserID:     actorID,
			Activity:   ievents.ActUserUpdated,
			Resource:   ievents.ResUser,
			ResourceID: req.UserID,
			IP:         ievents.ClientIP(r),
			Meta:       map[string]interface{}{"recovery_request": "rejected", "email": req.Email},
		})
		h.broadcastRecoveryRequest("rejected", req)
		utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
		return
	}

	user, accessToken, refreshToken, err := h.svc.Impersonate(r.Context(), req.UserID)
	if err != nil {
		log.Printf("auth.Handler.acceptRecoveryRequest: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to open recovery session")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     actorID,
		Activity:   ievents.ActUserLoggedIn,
		Resource:   ievents.ResUser,
		ResourceID: req.UserID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"recovery_request": "accepted", "email": req.Email},
	})
	delivered := false
	if h.hub != nil {
		delivered = h.hub.PushRecoveryAcceptedToGuestSession(req.GuestSessionID, map[string]interface{}{
			"request": req,
			"auth": models.AuthResponse{
				AccessToken:  accessToken,
				RefreshToken: refreshToken,
				User:         h.newAuthUser(r.Context(), user),
			},
		})
	}
	h.broadcastRecoveryRequest("accepted", req)
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "accepted",
		"delivered": delivered,
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
	if err2 := h.inboxSvc.SendSystemMessage(targetID, content, "text"); err2 != nil {
		log.Printf("user.Handler.resetPassword: noreply send failed: %v", err2)
	}
	if actorID != targetID {
		adminContent := fmt.Sprintf(
			"Hello,\n\nYou have reset the password for %s.\n\nThe new temporary password is:\n\n%s\n\nA copy of this reset has been sent to your inbox. Keep it secure and delete it when no longer needed.\n\n— System",
			displayName, newPw,
		)
		if err2 := h.inboxSvc.SendSystemMessage(actorID, adminContent, "text"); err2 != nil {
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
	if err2 := h.inboxSvc.SendSystemMessage(targetID, content, "text"); err2 != nil {
		log.Printf("user.Handler.adminResetPassword: noreply send failed: %v", err2)
	}

	content2 := fmt.Sprintf(
		"Hello,\n\nYou have reset the password for %s.\n\nThe new temporary password is:\n\n%s\n\nA copy of this reset has been sent to your inbox. Keep it secure and delete it when no longer needed.\n\n— System",
		displayName, newPw,
	)

	// Notify all other admins (best-effort).
	if err2 := h.inboxSvc.SendSystemMessage(actorID, content2, "text"); err2 != nil {
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
