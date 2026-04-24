package user

import (
	"encoding/json"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/auth"
	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/middleware"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// Upload config.
const (
	uploadsDir  = "./uploads"
	usersDir    = uploadsDir + "/users"
	maxFileSize = 10 * 1024 * 1024 // 10 MB
)

// userContentDir returns (and creates) ./uploads/users/{userID}/{subdir}.
func userContentDir(userID int64, subdir string) (string, error) {
	dir := filepath.Join(usersDir, strconv.FormatInt(userID, 10), subdir)
	return dir, os.MkdirAll(dir, 0755)
}

// NoreplyMessenger delivers automated inbox messages to users from the system account.
type NoreplyMessenger interface {
	SendNoreplyToUser(recipientID int64, content string) error
}

// Handler owns the HTTP layer for the user domain.
type Handler struct {
	svc        *Service
	hub        *ws.Hub
	dispatcher *ievents.Dispatcher
	noreply    NoreplyMessenger
	email      *iemail.Sender
}

// NewHandler returns a Handler backed by the given Service and WebSocket Hub.
func NewHandler(svc *Service, hub *ws.Hub, dispatcher *ievents.Dispatcher, noreply NoreplyMessenger, emailSender *iemail.Sender) *Handler {
	os.MkdirAll(usersDir, 0755) //nolint:errcheck
	return &Handler{svc: svc, hub: hub, dispatcher: dispatcher, noreply: noreply, email: emailSender}
}

// propagateUserSession refreshes a user's JWT and broadcasts it via WebSocket.
func (h *Handler) propagateUserSession(userID int64) {
	if h.hub == nil {
		return
	}
	u, err := h.svc.GetByID(userID)
	if err != nil {
		log.Printf("user.Handler.propagateUserSession: fetch user %d: %v", userID, err)
		return
	}
	u.PasswordHash = ""
	token, err := auth.GenerateTokenWithPermissions(
		u.ID, u.Username, u.Email, u.DisplayName, u.Roles, u.Permissions,
	)
	if err != nil {
		log.Printf("user.Handler.propagateUserSession: generate token for %d: %v", userID, err)
		return
	}
	h.hub.PropagateUser(userID, map[string]interface{}{
		"user":      u,
		"new_token": token,
	})
}

// Mount registers all user-domain routes onto r.
func (h *Handler) Mount(r chi.Router, jwt, optJWT func(http.Handler) http.Handler) {
	// Auth
	r.Route("/auth", func(r chi.Router) {
		r.With(middleware.AuthLimitMiddleware()).Post("/register", h.register)
		r.With(middleware.AuthLimitMiddleware()).Post("/login", h.login)
		r.With(middleware.AuthLimitMiddleware()).Post("/login/totp", h.loginTOTP)
		r.With(middleware.AuthLimitMiddleware()).Post("/refresh", h.refreshToken)
		r.With(jwt).Post("/logout", h.logout)

		// Email verification (public — token-authenticated)
		r.With(middleware.AuthLimitMiddleware()).Post("/verify-email", h.verifyEmail)
		r.With(jwt).Post("/resend-verification", h.resendVerification)

		// Password recovery (public — no auth required)
		r.With(middleware.AuthLimitMiddleware()).Post("/forgot-password", h.forgotPassword)
		r.With(middleware.AuthLimitMiddleware()).Post("/reset-password", h.resetPasswordWithToken)

		// 2FA / TOTP (requires auth)
		r.With(jwt).Post("/totp/setup", h.totpSetup)
		r.With(jwt).Post("/totp/enable", h.totpEnable)
		r.With(jwt).Post("/totp/disable", h.totpDisable)
	})

	// Users
	r.Route("/users", func(r chi.Router) {
		// Public (guest-safe) reads
		r.With(optJWT).Get("/{id}", h.getUser)
		r.Get("/roles", h.getRoles)
		r.Get("/permissions", h.getPermissions)

		// Authenticated
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Get("/profile", h.getProfile)
			r.Get("/search", h.searchUsers)
			r.Post("/", h.createUser)
			r.Put("/{id}", h.updateUser)
			r.Post("/{id}/permissions", h.addPermission)
			r.Delete("/{id}/permissions/{perm}", h.removePermission)
			r.Post("/{id}/roles", h.addRole)
			r.Delete("/{id}/roles/{role}", h.removeRole)
			r.Post("/{id}/suspend", h.suspendUser)
			r.Delete("/{id}/suspend", h.unsuspendUser)
			r.Post("/{id}/reset-password", h.resetPassword)
			r.Post("/me/photo", h.uploadProfilePhoto)
			r.Post("/me/banner", h.uploadProfileBanner)
			r.Post("/{id}/photo", h.uploadUserPhoto)
			r.Post("/{id}/banner", h.uploadUserBanner)
			// Superuser sacrifice endpoint
			r.Post("/{id}/superuser-sacrifice", h.newDistinctSuperuserDemotionVote)

			// Admin TOTP endpoints
			r.Post("/{id}/totp/enable", h.adminEnableTOTP)
			r.Post("/{id}/totp/disable", h.adminDisableTOTP)
		})
	})

}

// User handlers

func (h *Handler) getUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	user, err := h.svc.GetByID(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	user.PasswordHash = ""
	utils.WriteJSON(w, http.StatusOK, user)
}

func (h *Handler) getProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.svc.GetByID(userID)
	if err != nil {
		log.Printf("user.Handler.getProfile: %v", err)
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user.PasswordHash = ""
	utils.WriteJSON(w, http.StatusOK, user)
}

func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
	// Placeholder — full admin-create flow can be added here.
	utils.WriteJSON(w, http.StatusCreated, map[string]string{
		"message": "User created",
		"status":  "success",
	})
}

func (h *Handler) updateUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	// Only the owner or someone with user.manage-others may update.
	canManage, _ := h.svc.HasPermission(userID, "user.manage-others")
	if userID != id && !canManage {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if userID != id && canManage && !h.checkManagePowerLevel(w, userID, id) {
		return
	}

	existing, err := h.svc.GetByID(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	var patch struct {
		DisplayName string  `json:"display_name"`
		Bio         string  `json:"bio"`
		AvatarURL   string  `json:"avatar_url"`
		BannerURL   string  `json:"banner_url"`
		DiscordID   *string `json:"discord_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if patch.DisplayName != "" {
		existing.DisplayName = patch.DisplayName
	}
	if patch.Bio != "" {
		existing.Bio = patch.Bio
	}
	if patch.AvatarURL != "" {
		existing.AvatarURL = patch.AvatarURL
	}
	if patch.BannerURL != "" {
		existing.BannerURL = patch.BannerURL
	}
	if patch.DiscordID != nil {
		existing.DiscordID = patch.DiscordID
	}

	updated, err := h.svc.Update(existing)
	if err != nil {
		log.Printf("user.Handler.updateUser: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	updated.PasswordHash = ""
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActUserUpdated,
		Resource:   ievents.ResUser,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			if h.hub != nil {
				h.hub.PropagateUser(id, map[string]interface{}{"user": updated})
				payload, _ := json.Marshal(map[string]interface{}{
					"action": "user_updated",
					"data":   map[string]interface{}{"user": updated},
				})
				h.hub.SendToUser(id, &ws.Message{Type: ws.UserUpdate, Payload: payload})
			}
		},
	})
	utils.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) searchUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 50
	offset := 0
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	if offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
			offset = v
		}
	}

	var users []*models.User
	var err error
	if q == "" {
		users, err = h.svc.List(limit, offset)
	} else {
		users, err = h.svc.Search(q, limit, offset)
	}
	if err != nil {
		log.Printf("user.Handler.searchUsers: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to search users")
		return
	}

	for _, u := range users {
		u.PasswordHash = ""
	}
	utils.WriteJSON(w, http.StatusOK, users)
}

func (h *Handler) suspendUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.suspend") {
		return
	}

	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if !h.checkManagePowerLevel(w, userID, targetID) {
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck

	if err := h.svc.Suspend(targetID, req.Reason); err != nil {
		log.Printf("user.Handler.suspendUser: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to suspend user")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActUserSuspended,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"reason": req.Reason},
		Fn:         func() { h.propagateUserSession(targetID) },
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "user suspended"})
}

func (h *Handler) unsuspendUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.suspend") {
		return
	}

	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if !h.checkManagePowerLevel(w, userID, targetID) {
		return
	}

	if err := h.svc.Unsuspend(targetID); err != nil {
		log.Printf("user.Handler.unsuspendUser: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to unsuspend user")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActUserUnsuspended,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
		Fn:         func() { h.propagateUserSession(targetID) },
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "user unsuspended"})
}
