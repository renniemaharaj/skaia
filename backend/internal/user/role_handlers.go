package user

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

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

	// Enforce: cannot assign a role if you do not have all its permissions or its power level > your own
	roleObj, err := h.svc.GetRoleByIDName(req.Role)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "role not found")
		return
	}
	actorLevel, err := h.svc.GetUserMaxPowerLevel(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "power level check failed")
		return
	}
	if roleObj.PowerLevel > actorLevel {
		utils.WriteError(w, http.StatusForbidden, "cannot assign a role with power level exceeding your own")
		return
	}
	perms, err := h.svc.GetRolePermissions(roleObj.ID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to fetch role permissions")
		return
	}
	for _, perm := range perms {
		hasPerm, err := h.svc.HasPermission(userID, perm.Name)
		if err != nil {
			utils.WriteError(w, http.StatusInternalServerError, "permission check failed")
			return
		}
		if !hasPerm {
			utils.WriteError(w, http.StatusForbidden, "cannot assign a role with permissions you do not have")
			return
		}
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

	roleID, err := parseID(r, "id")
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

	roleID, err := parseID(r, "id")
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

	// Enforce: cannot assign a permission you do not have
	hasPerm, err := h.svc.HasPermission(userID, req.Permission)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "permission check failed")
		return
	}
	if !hasPerm {
		utils.WriteError(w, http.StatusForbidden, "cannot assign a permission you do not have")
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

	roleID, err := parseID(r, "id")
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
