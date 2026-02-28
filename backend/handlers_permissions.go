package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/skaia/backend/auth"
)

// handleSearchUsers searches for users
func handleSearchUsers(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		query := r.URL.Query().Get("q")
		if query == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "search query required"})
			return
		}

		users, err := appCtx.UserRepo.SearchUsers(query, 20, 0)
		if err != nil {
			log.Printf("Error searching users: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to search users"})
			return
		}

		// Clear password hashes from response
		for _, user := range users {
			user.PasswordHash = ""
		}

		json.NewEncoder(w).Encode(users)
	}
}

// handleGetPermissions returns all available permissions
func handleGetPermissions(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		permissions, err := appCtx.UserRepo.GetAllPermissions()
		if err != nil {
			log.Printf("Error fetching permissions: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to fetch permissions"})
			return
		}

		json.NewEncoder(w).Encode(permissions)
	}
}

// handleAddUserPermission adds a permission to a user
func handleAddUserPermission(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Check permission
		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Check for permission to manage permissions
		hasPermission := false
		for _, perm := range claims.Permissions {
			if perm == "user.manage-permissions" {
				hasPermission = true
				break
			}
		}

		if !hasPermission {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
			return
		}

		userID := chi.URLParam(r, "id")
		userUUID, err := uuid.Parse(userID)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid user id"})
			return
		}

		var req struct {
			Permission string `json:"permission"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		if req.Permission == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "permission name required"})
			return
		}

		err = appCtx.UserRepo.AddPermission(userUUID, req.Permission)
		if err != nil {
			log.Printf("Error adding permission: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to add permission"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "permission added"})
	}
}

// handleRemoveUserPermission removes a permission from a user
func handleRemoveUserPermission(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Check permission
		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Check for permission to manage permissions
		hasPermission := false
		for _, perm := range claims.Permissions {
			if perm == "user.manage-permissions" {
				hasPermission = true
				break
			}
		}

		if !hasPermission {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
			return
		}

		userID := chi.URLParam(r, "id")
		permName := chi.URLParam(r, "perm")

		userUUID, err := uuid.Parse(userID)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid user id"})
			return
		}

		err = appCtx.UserRepo.RemovePermission(userUUID, permName)
		if err != nil {
			log.Printf("Error removing permission: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to remove permission"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "permission removed"})
	}
}
