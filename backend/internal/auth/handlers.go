package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/lib/pq"

	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	iinbox "github.com/skaia/backend/internal/inbox"
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

// newAuthUser converts a User to an AuthUser, including TOTP status.
func (h *Handler) newAuthUser(ctx context.Context, user *models.User) *models.AuthUser {
	if user == nil {
		return nil
	}
	_, enabled, err := h.svc.GetTOTPEnabled(ctx, user.ID)
	if err != nil {
		return models.NewAuthUser(user, false)
	}
	return models.NewAuthUser(user, enabled)
}

// propagateAuthUser invalidates the user's cache and propagates the updated user info to all sessions.
func (h *Handler) propagateAuthUser(ctx context.Context, userID int64, extra map[string]interface{}) {
	if h.userSvc == nil {
		return
	}
	h.userSvc.InvalidateUser(userID)
	updatedUser, err := h.userSvc.GetByID(userID)
	if err != nil {
		log.Printf("auth.Handler.propagateAuthUser: failed to refresh user %d: %v", userID, err)
		return
	}
	payload := map[string]interface{}{"user": h.newAuthUser(ctx, updatedUser)}
	for k, v := range extra {
		payload[k] = v
	}
	if h.hub != nil {
		go h.hub.PropagateUser(userID, payload)
	}
}

// Login handles user login, including password verification and optional TOTP 2FA.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, accessToken, err := h.svc.Login(r.Context(), req.Email, req.Password)
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
	totpSecret, enabled, _ := h.svc.GetTOTPEnabled(r.Context(), user.ID)
	if enabled {
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
	if totpSecret != "" && !enabled {
		log.Printf("user.Handler.login: WARNING: user %d has TOTP secret but 2FA not enabled. Allowing login.", user.ID)
	}

	h.propagateAuthUser(r.Context(), user.ID, map[string]interface{}{"new_token": accessToken})

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
		User:         h.newAuthUser(r.Context(), user),
	})
}

// Register handles user registration, including input validation and sending verification email.
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

	user, accessToken, refreshToken, err := h.svc.Register(r.Context(), &req)
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
			token, err := h.svc.CreateEmailVerificationToken(r.Context(), uid)
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
		User:         h.newAuthUser(r.Context(), user),
	})
}

// Logout handles user logout by dispatching a logout event. Actual token invalidation is handled client-side by deleting the token.
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

// ChangePassword handles a user's request to change their password.
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.ChangePassword(r.Context(), userID, req.OldPassword, req.NewPassword); err != nil {
		if errors.Is(err, ErrInvalidPassword) {
			utils.WriteError(w, http.StatusUnauthorized, "incorrect old password")
			return
		}
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "success",
		"message": "password updated successfully",
	})
}
