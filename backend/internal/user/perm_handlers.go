package user

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/auth"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
)

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
