package user

import (
	"encoding/json"
	"errors"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	iemail "github.com/skaia/backend/internal/email"
	ievents "github.com/skaia/backend/internal/events"
	ijwt "github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// Upload config.
const (
	uploadsDir = "./uploads"
	usersDir   = uploadsDir + "/users"
)

// userContentDir returns (and creates) ./uploads/users/{userID}/{subdir}.
func userContentDir(userID int64, subdir string) (string, error) {
	dir := filepath.Join(usersDir, strconv.FormatInt(userID, 10), subdir)
	return dir, os.MkdirAll(dir, 0755)
}

// InboxSender is the shared interface for sending noreply inbox messages.
type InboxSender interface {
	SendSystemMessage(recipientID int64, content, messageType string) error
}

// Handler owns the HTTP layer for the user domain.
type Handler struct {
	svc        *Service
	hub        *ws.Hub
	dispatcher *ievents.Dispatcher
	inbox      InboxSender
	email      *iemail.Sender
}

// NewHandler returns a Handler backed by the given Service and WebSocket Hub.
func NewHandler(svc *Service, hub *ws.Hub, dispatcher *ievents.Dispatcher, inboxSender InboxSender, emailSender *iemail.Sender) *Handler {
	os.MkdirAll(usersDir, 0755) //nolint:errcheck
	return &Handler{svc: svc, hub: hub, dispatcher: dispatcher, inbox: inboxSender, email: emailSender}
}

// Mount registers all user-domain routes onto r.
func (h *Handler) Mount(r chi.Router, jwt, optJWT func(http.Handler) http.Handler) {
	// Users
	r.Route("/users", func(r chi.Router) {
		// Public (guest-safe) reads
		r.With(optJWT).Post("/batch", h.getUsersBatch)
		r.With(optJWT).Get("/{id}", h.getUser)
		r.Get("/roles", h.getRoles)

		// Authenticated
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Get("/profile", h.getProfile)
			r.Get("/search", h.searchUsers)
			r.Get("/mentions", h.searchMentions)
			r.Post("/", h.createUser)
			r.Put("/{id}", h.updateUser)
			r.Post("/{id}/roles", h.addRole)
			r.Delete("/{id}/roles/{role}", h.removeRole)
			r.Post("/{id}/suspend", h.suspendUser)
			r.Delete("/{id}/suspend", h.unsuspendUser)
			r.Post("/me/photo", h.uploadProfilePhoto)
			r.Post("/me/banner", h.uploadProfileBanner)
			r.Post("/{id}/photo", h.uploadUserPhoto)
			r.Post("/{id}/banner", h.uploadUserBanner)
			// Superuser sacrifice endpoint
			r.Post("/{id}/superuser-sacrifice", h.newDistinctSuperuserDemotionVote)

			// Permission management endpoints
			r.Get("/permissions", h.getPermissions)
			r.Post("/{id}/permissions/{perm}", h.addPermission)
			r.Delete("/{id}/permissions/{perm}", h.removePermission)

			// Role management endpoints
			r.Get("/roles", h.getRoles)
			r.Post("/roles", h.createRole)
			r.Put("/roles/{id}", h.updateRole)
			r.Delete("/roles/{id}", h.deleteRole)
			r.Get("/roles/{id}/permissions", h.getRolePermissions)
			r.Get("/roles/{id}/users", h.getRoleUsers)
			r.Delete("/roles/{id}/permissions/{perm}", h.removePermissionFromRole)
			r.Post("/roles/{id}/permissions/{perm}", h.addPermissionToRole)
		})
	})

}

// User handlers
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
	token, err := ijwt.GenerateTokenWithPermissions(
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

func (h *Handler) getUser(w http.ResponseWriter, r *http.Request) {
	id, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	user, err := h.svc.GetByID(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	utils.WriteJSON(w, http.StatusOK, user)
}

const maxUserBatchSize = 50

var (
	errInvalidUserBatchID = errors.New("user ids must be positive")
	errUserBatchTooLarge  = errors.New("too many user ids")
)

func normalizeUserBatchIDs(input []int64) ([]int64, error) {
	ids := make([]int64, 0, len(input))
	seen := make(map[int64]struct{}, len(input))
	for _, id := range input {
		if id <= 0 {
			return nil, errInvalidUserBatchID
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
		if len(ids) > maxUserBatchSize {
			return nil, errUserBatchTooLarge
		}
	}
	return ids, nil
}

func (h *Handler) getUsersBatch(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ids, err := normalizeUserBatchIDs(req.IDs)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(ids) == 0 {
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"users": []*models.User{}})
		return
	}
	users := make([]*models.User, 0, len(ids))
	for _, id := range ids {
		user, err := h.svc.GetByID(id)
		if err != nil {
			continue
		}
		users = append(users, user)
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"users": users})
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

	utils.WriteJSON(w, http.StatusOK, user)
}

func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
	// Placeholder - full admin-create flow can be added here.
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

	id, err := utils.ParseUserIdFromParam(r, "id")
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
	if userID != id && canManage && !h.checkManagedPowerLevel(w, userID, id) {
		return
	}

	existing, err := h.svc.GetByID(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	var patch struct {
		DisplayName        *string `json:"display_name"`
		Bio                *string `json:"bio"`
		AvatarURL          *string `json:"avatar_url"`
		BannerURL          *string `json:"banner_url"`
		DiscordID          *string `json:"discord_id"`
		BackgroundImageURL *string `json:"background_image_url"`
		BackgroundVideoURL *string `json:"background_video_url"`
		BackgroundPosition *string `json:"background_position"`
		FontFamily         *string `json:"font_family"`
		ProfileCardArtURL  *string `json:"profile_card_art_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if patch.DisplayName != nil {
		existing.DisplayName = *patch.DisplayName
	}
	if patch.Bio != nil {
		existing.Bio = *patch.Bio
	}
	if patch.AvatarURL != nil {
		existing.AvatarURL = *patch.AvatarURL
	}
	if patch.BannerURL != nil {
		existing.BannerURL = *patch.BannerURL
	}
	if patch.DiscordID != nil {
		existing.DiscordID = patch.DiscordID
	}
	if patch.BackgroundImageURL != nil {
		if *patch.BackgroundImageURL == "" {
			existing.BackgroundImageURL = nil
		} else {
			existing.BackgroundImageURL = patch.BackgroundImageURL
		}
	}
	if patch.BackgroundVideoURL != nil {
		if *patch.BackgroundVideoURL == "" {
			existing.BackgroundVideoURL = nil
		} else {
			existing.BackgroundVideoURL = patch.BackgroundVideoURL
		}
	}
	if patch.BackgroundPosition != nil {
		if *patch.BackgroundPosition == "" {
			existing.BackgroundPosition = nil
		} else {
			existing.BackgroundPosition = patch.BackgroundPosition
		}
	}
	if patch.FontFamily != nil {
		if *patch.FontFamily == "" {
			existing.FontFamily = nil
		} else {
			existing.FontFamily = patch.FontFamily
		}
	}
	if patch.ProfileCardArtURL != nil {
		if *patch.ProfileCardArtURL == "" {
			existing.ProfileCardArtURL = nil
		} else {
			existing.ProfileCardArtURL = patch.ProfileCardArtURL
		}
	}

	updated, err := h.svc.Update(existing)
	if err != nil {
		log.Printf("user.Handler.updateUser: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

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

	utils.WriteJSON(w, http.StatusOK, users)
}

func (h *Handler) searchMentions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")

	type MentionItem struct {
		ID     string `json:"id"`
		Type   string `json:"type"` // "user", "role", "special"
		Name   string `json:"name"`
		Avatar string `json:"avatar,omitempty"`
	}

	var items []MentionItem

	// Add special tags
	qLower := strings.ToLower(q)
	if q == "" || strings.HasPrefix("here", qLower) {
		items = append(items, MentionItem{ID: "special-here", Type: "special", Name: "here"})
	}
	if q == "" || strings.HasPrefix("everyone", qLower) {
		items = append(items, MentionItem{ID: "special-everyone", Type: "special", Name: "everyone"})
	}

	// Add roles
	roles, err := h.svc.GetAllRoles()
	if err == nil {
		for _, role := range roles {
			if q == "" || strings.HasPrefix(strings.ToLower(role.Name), qLower) {
				items = append(items, MentionItem{ID: "role-" + strconv.FormatInt(role.ID, 10), Type: "role", Name: role.Name})
			}
		}
	}

	// Add users
	var users []*models.User
	if q == "" {
		users, _ = h.svc.List(5, 0)
	} else {
		users, _ = h.svc.Search(q, 5, 0)
	}

	for _, u := range users {
		items = append(items, MentionItem{ID: "user-" + strconv.FormatInt(u.ID, 10), Type: "user", Name: u.Username, Avatar: u.AvatarURL})
	}

	utils.WriteJSON(w, http.StatusOK, items)
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

	targetID, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if !h.checkManagedPowerLevel(w, userID, targetID) {
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
		// No propagateUserSession; handled by auth
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

	targetID, err := utils.ParseUserIdFromParam(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if !h.checkManagedPowerLevel(w, userID, targetID) {
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
		// No propagateUserSession; handled by auth
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "user unsuspended"})
}
