package user

import (
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"
	"github.com/skaia/backend/internal/auth"
	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/middleware"
	iupload "github.com/skaia/backend/internal/upload"
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

// propagatePermissions sends only the changed permissions/roles and a fresh
// JWT directly to the user's connected client(s). No subscription required —
// if the user is online they receive it immediately.
func (h *Handler) propagatePermissions(userID int64) {
	if h.hub == nil {
		return
	}
	u, err := h.svc.GetByID(userID)
	if err != nil {
		log.Printf("user.Handler.propagatePermissions: fetch user %d: %v", userID, err)
		return
	}
	token, err := auth.GenerateTokenWithPermissions(
		u.ID, u.Username, u.Email, u.DisplayName, u.Roles, u.Permissions,
	)
	if err != nil {
		log.Printf("user.Handler.propagatePermissions: generate token for %d: %v", userID, err)
		return
	}
	// Send only the fields that matter — the frontend merges them into
	// the existing currentUserAtom so the UI reacts instantly.
	payload, _ := json.Marshal(map[string]interface{}{
		"action": "permissions_changed",
		"data": map[string]interface{}{
			"id":          u.ID,
			"roles":       u.Roles,
			"permissions": u.Permissions,
			"new_token":   token,
		},
	})
	h.hub.SendToUser(userID, &ws.Message{Type: ws.UserUpdate, Payload: payload})
}

// checkManagePowerLevel enforces that actorID's max power level is strictly
// greater than targetID's. Returns true (allowed) or writes a 403 and returns false.
func (h *Handler) checkManagePowerLevel(w http.ResponseWriter, actorID, targetID int64) bool {
	actorLevel, err := h.svc.GetUserMaxPowerLevel(actorID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "power level check failed")
		return false
	}
	targetLevel, err := h.svc.GetUserMaxPowerLevel(targetID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "power level check failed")
		return false
	}
	if actorLevel <= targetLevel {
		utils.WriteError(w, http.StatusForbidden, "insufficient power level to manage this user")
		return false
	}
	return true
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
		})
	})

	// Permissions & roles catalogue
	r.Route("/permissions", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/", h.getPermissions)
	})
	r.Route("/roles", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/", h.getRoles)
		r.Post("/", h.createRole)
		r.Route("/{roleId}", func(r chi.Router) {
			r.Put("/", h.updateRole)
			r.Delete("/", h.deleteRole)
			r.Get("/permissions", h.getRolePermissions)
			r.Post("/permissions", h.addPermissionToRole)
			r.Delete("/permissions/{perm}", h.removePermissionFromRole)
		})
	})
}

// Auth handlers

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
	if len(req.Password) < 8 {
		utils.WriteError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if len(req.Password) > 72 {
		utils.WriteError(w, http.StatusBadRequest, "password must be at most 72 characters")
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
			utils.WriteError(w, http.StatusInternalServerError, "registration failed")
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
			utils.WriteError(w, http.StatusInternalServerError, "login failed")
			return
		}
		utils.WriteJSON(w, http.StatusOK, models.AuthResponse{
			RequiresTOTP: true,
			TOTPToken:    totpToken,
		})
		return
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
		utils.WriteError(w, http.StatusUnauthorized, err.Error())
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

// Permission handlers

func (h *Handler) getPermissions(w http.ResponseWriter, r *http.Request) {
	perms, err := h.svc.GetAllPermissions()
	if err != nil {
		log.Printf("user.Handler.getPermissions: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to fetch permissions")
		return
	}
	utils.WriteJSON(w, http.StatusOK, perms)
}

func (h *Handler) addPermission(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
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
		Permission string `json:"permission"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Permission == "" {
		utils.WriteError(w, http.StatusBadRequest, "permission name required")
		return
	}

	if err := h.svc.AddPermission(targetID, req.Permission); err != nil {
		log.Printf("user.Handler.addPermission: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to add permission")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActPermissionAdded,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"permission": req.Permission},
		Fn: func() {
			h.propagatePermissions(targetID)
			h.propagateUserSession(targetID)
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "permission added"})
}

func (h *Handler) removePermission(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
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
	permName := chi.URLParam(r, "perm")

	if err := h.svc.RemovePermission(targetID, permName); err != nil {
		log.Printf("user.Handler.removePermission: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to remove permission")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActPermissionRemoved,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"permission": permName},
		Fn: func() {
			h.propagatePermissions(targetID)
			h.propagateUserSession(targetID)
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "permission removed"})
}

func (h *Handler) getRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.svc.GetAllRoles()
	if err != nil {
		log.Printf("user.Handler.getRoles: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to fetch roles")
		return
	}
	utils.WriteJSON(w, http.StatusOK, roles)
}

func (h *Handler) addRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
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
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Role == "" {
		utils.WriteError(w, http.StatusBadRequest, "role name required")
		return
	}

	if err := h.svc.AddRoleByName(targetID, req.Role); err != nil {
		log.Printf("user.Handler.addRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to add role")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActRoleAdded,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"role": req.Role},
		Fn: func() {
			h.propagatePermissions(targetID)
			h.propagateUserSession(targetID)
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "role added"})
}

func (h *Handler) removeRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
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
	roleName := chi.URLParam(r, "role")
	if roleName == "" {
		utils.WriteError(w, http.StatusBadRequest, "role name required")
		return
	}

	if err := h.svc.RemoveRoleByName(targetID, roleName); err != nil {
		log.Printf("user.Handler.removeRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to remove role")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActRoleRemoved,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"role": roleName},
		Fn: func() {
			h.propagatePermissions(targetID)
			h.propagateUserSession(targetID)
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "role removed"})
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

// FileUploadResponse is returned after a successful upload.
type FileUploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

func (h *Handler) uploadProfilePhoto(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if msg := iupload.CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := iupload.CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "photo field required")
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck

	photoDir, err := userContentDir(userID, "photos")
	if err != nil {
		log.Printf("user.Handler.uploadProfilePhoto: mkdir: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	filename := fmt.Sprintf("photo_%d%s", time.Now().UnixNano(), filepath.Ext(header.Filename))
	dst, err := os.Create(filepath.Join(photoDir, filename))
	if err != nil {
		log.Printf("user.Handler.uploadProfilePhoto: create file: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()

	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	u, err := h.svc.GetByID(userID)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	oldPhotoURL := u.PhotoURL
	u.PhotoURL = fmt.Sprintf("/uploads/users/%d/photos/%s", userID, filename)
	if _, err = h.svc.Update(u); err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	// Remove old photo file.
	go iupload.DeleteUploadFile(oldPhotoURL)

	if h.hub != nil {
		u.PasswordHash = ""
		go h.hub.PropagateUser(userID, map[string]interface{}{"user": u})
		payload, _ := json.Marshal(map[string]interface{}{
			"action": "user_updated",
			"data":   map[string]interface{}{"user": u},
		})
		go h.hub.SendToUser(userID, &ws.Message{Type: ws.UserUpdate, Payload: payload})
	}
	utils.WriteJSON(w, http.StatusCreated, FileUploadResponse{
		URL:      u.PhotoURL,
		Filename: filename,
		Size:     size,
		Type:     header.Header.Get("Content-Type"),
	})
}

func (h *Handler) uploadProfileBanner(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	h.saveAndStoreBanner(w, r, userID)
}

func (h *Handler) uploadUserPhoto(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	// Only allow if acting on own profile or has user.manage-others permission
	canManage, _ := h.svc.HasPermission(userID, "user.manage-others")
	if userID != targetID && !canManage {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	if msg := iupload.CheckUserQuota(targetID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := iupload.CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("photo")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "photo field required")
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck

	photoDir, err := userContentDir(targetID, "photos")
	if err != nil {
		log.Printf("user.Handler.uploadUserPhoto: mkdir: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	filename := fmt.Sprintf("photo_%d%s", time.Now().UnixNano(), filepath.Ext(header.Filename))
	dst, err := os.Create(filepath.Join(photoDir, filename))
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()
	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	u, err := h.svc.GetByID(targetID)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	oldPhotoURL := u.PhotoURL
	u.PhotoURL = fmt.Sprintf("/uploads/users/%d/photos/%s", targetID, filename)
	if _, err = h.svc.Update(u); err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	// Remove old photo file.
	go iupload.DeleteUploadFile(oldPhotoURL)

	if h.hub != nil {
		u.PasswordHash = ""
		go h.hub.PropagateUser(targetID, map[string]interface{}{"user": u})
		payload, _ := json.Marshal(map[string]interface{}{
			"action": "user_updated",
			"data":   map[string]interface{}{"user": u},
		})
		go h.hub.SendToUser(targetID, &ws.Message{Type: ws.UserUpdate, Payload: payload})
	}
	utils.WriteJSON(w, http.StatusCreated, FileUploadResponse{URL: u.PhotoURL, Filename: filename, Size: size, Type: header.Header.Get("Content-Type")})
}

func (h *Handler) uploadUserBanner(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	canManage, _ := h.svc.HasPermission(userID, "user.manage-others")
	if userID != targetID && !canManage {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	h.saveAndStoreBanner(w, r, targetID)
}

func (h *Handler) saveAndStoreBanner(w http.ResponseWriter, r *http.Request, userID int64) {
	if msg := iupload.CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := iupload.CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("banner")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "banner field required")
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck
	if err := validateBannerDimensions(file); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck

	bannerDir, err := userContentDir(userID, "banners")
	if err != nil {
		log.Printf("user.Handler.saveAndStoreBanner: mkdir: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	filename := fmt.Sprintf("banner_%d%s", time.Now().UnixNano(), filepath.Ext(header.Filename))
	dst, err := os.Create(filepath.Join(bannerDir, filename))
	if err != nil {
		log.Printf("user.Handler.saveAndStoreBanner: create file: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()
	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(bannerDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	u, err := h.svc.GetByID(userID)
	if err != nil {
		os.Remove(filepath.Join(bannerDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	oldBannerURL := u.BannerURL
	u.BannerURL = fmt.Sprintf("/uploads/users/%d/banners/%s", userID, filename)
	if _, err = h.svc.Update(u); err != nil {
		os.Remove(filepath.Join(bannerDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	// Remove old banner file.
	go iupload.DeleteUploadFile(oldBannerURL)
	if h.hub != nil {
		u.PasswordHash = ""
		go h.hub.PropagateUser(userID, map[string]interface{}{"user": u})
		payload, _ := json.Marshal(map[string]interface{}{
			"action": "user_updated",
			"data":   map[string]interface{}{"user": u},
		})
		go h.hub.SendToUser(userID, &ws.Message{Type: ws.UserUpdate, Payload: payload})
	}
	utils.WriteJSON(w, http.StatusCreated, FileUploadResponse{URL: u.BannerURL, Filename: filename, Size: size, Type: header.Header.Get("Content-Type")})
}

// Internal utilities

func parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

func validateImageFile(file io.Reader, headers map[string][]string) error {
	ct := ""
	if vals, ok := headers["Content-Type"]; ok && len(vals) > 0 {
		ct = vals[0]
	}
	for _, allowed := range []string{"image/jpeg", "image/png", "image/webp", "image/gif"} {
		if ct == allowed {
			return nil
		}
	}
	return errors.New("only JPEG, PNG, WEBP, and GIF images are allowed")
}

func validateBannerDimensions(file io.Reader) error {
	cfg, _, err := image.DecodeConfig(file)
	if err != nil {
		return errors.New("failed to read image dimensions")
	}
	if cfg.Height != 350 {
		return fmt.Errorf("banner height must be 350px, got %dpx", cfg.Height)
	}
	return nil
}

// Role CRUD handlers

func (h *Handler) createRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		PowerLevel  int    `json:"power_level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "role name required")
		return
	}

	// Actor cannot create a role with power level >= their own.
	actorLevel, err := h.svc.GetUserMaxPowerLevel(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "power level check failed")
		return
	}
	if req.PowerLevel >= actorLevel {
		utils.WriteError(w, http.StatusForbidden, "cannot create a role with power level equal to or exceeding your own")
		return
	}

	role, err := h.svc.CreateRole(req.Name, req.Description, req.PowerLevel)
	if err != nil {
		log.Printf("user.Handler.createRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create role")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, role)
}

func (h *Handler) updateRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
		return
	}

	roleID, err := parseID(r, "roleId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		PowerLevel  int    `json:"power_level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "role name required")
		return
	}

	actorLevel, err := h.svc.GetUserMaxPowerLevel(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "power level check failed")
		return
	}
	if req.PowerLevel >= actorLevel {
		utils.WriteError(w, http.StatusForbidden, "cannot set power level equal to or exceeding your own")
		return
	}

	role, err := h.svc.UpdateRole(roleID, req.Name, req.Description, req.PowerLevel)
	if err != nil {
		log.Printf("user.Handler.updateRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to update role")
		return
	}
	utils.WriteJSON(w, http.StatusOK, role)
}

func (h *Handler) deleteRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
		return
	}

	roleID, err := parseID(r, "roleId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	// Prevent deleting a role with power level >= actor's level.
	role, err := h.svc.GetRoleByID(roleID)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "role not found")
		return
	}
	actorLevel, err := h.svc.GetUserMaxPowerLevel(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "power level check failed")
		return
	}
	if role.PowerLevel >= actorLevel {
		utils.WriteError(w, http.StatusForbidden, "cannot delete a role with power level equal to or exceeding your own")
		return
	}

	if err := h.svc.DeleteRole(roleID); err != nil {
		log.Printf("user.Handler.deleteRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete role")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "role deleted"})
}

func (h *Handler) getRolePermissions(w http.ResponseWriter, r *http.Request) {
	_, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	roleID, err := parseID(r, "roleId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	perms, err := h.svc.GetRolePermissions(roleID)
	if err != nil {
		log.Printf("user.Handler.getRolePermissions: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to fetch role permissions")
		return
	}
	if perms == nil {
		perms = []*models.Permission{}
	}
	utils.WriteJSON(w, http.StatusOK, perms)
}

func (h *Handler) addPermissionToRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
		return
	}

	roleID, err := parseID(r, "roleId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid role id")
		return
	}

	var req struct {
		Permission string `json:"permission"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Permission == "" {
		utils.WriteError(w, http.StatusBadRequest, "permission name required")
		return
	}

	if err := h.svc.AddPermissionToRole(roleID, req.Permission); err != nil {
		log.Printf("user.Handler.addPermissionToRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to add permission to role")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "permission added to role"})
}

func (h *Handler) removePermissionFromRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
		return
	}

	roleID, err := parseID(r, "roleId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid role id")
		return
	}
	permName := chi.URLParam(r, "perm")

	if err := h.svc.RemovePermissionFromRole(roleID, permName); err != nil {
		log.Printf("user.Handler.removePermissionFromRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to remove permission from role")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "permission removed from role"})
}

// ── Email verification handlers ─────────────────────────────────────────────

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

// ── Password recovery handlers ──────────────────────────────────────────────

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

// ── TOTP / 2FA handlers ────────────────────────────────────────────────────

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
		utils.WriteError(w, http.StatusBadRequest, "2FA is not enabled for this account")
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
