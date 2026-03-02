package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/skaia/backend/auth"
	"github.com/skaia/backend/models"
)

// handleRegister handles user registration
func handleRegister(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req models.RegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		// Validate input
		if req.Email == "" || req.Password == "" || req.Username == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "email, password, and username required"})
			return
		}

		// Hash password
		hashedPassword, err := auth.HashPassword(req.Password)
		if err != nil {
			log.Printf("Error hashing password: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "registration failed"})
			return
		}

		// Create user with display name defaulting to username
		displayName := req.DisplayName
		if displayName == "" {
			displayName = req.Username
		}

		newUser := &models.User{
			Username:    req.Username,
			Email:       req.Email,
			DisplayName: displayName,
		}

		// Save user to database with hashed password
		user, err := appCtx.UserRepo.CreateUser(newUser, hashedPassword)
		if err != nil {
			log.Printf("Error creating user: %v", err)
			if err.Error() == "UNIQUE constraint failed" {
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]string{"error": "user already exists"})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "registration failed"})
			return
		}

		// Generate tokens
		accessToken, err := auth.GenerateTokenWithPermissions(user.ID, user.Username, user.Email, user.DisplayName, user.Roles, user.Permissions)
		if err != nil {
			log.Printf("Error generating access token: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to generate token"})
			return
		}

		refreshToken, err := auth.GenerateRefreshToken(user.ID)
		if err != nil {
			log.Printf("Error generating refresh token: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to generate token"})
			return
		}

		// Clear password hash from response
		user.PasswordHash = ""

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(models.AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			User:         user,
		})
	}
}

// handleLogin handles user login
func handleLogin(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req models.LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		if req.Email == "" || req.Password == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "email and password required"})
			return
		}

		// Find user by email
		user, err := appCtx.UserRepo.GetUserByEmail(req.Email)
		if err != nil {
			if err.Error() == "user not found" {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid credentials"})
				return
			}
			log.Printf("Error fetching user: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "login failed"})
			return
		}

		// Check password
		if !auth.ComparePassword(user.PasswordHash, req.Password) {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid credentials"})
			return
		}

		// Check if user is suspended
		if user.IsSuspended {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error":  "user account is suspended",
				"reason": *user.SuspendedReason,
			})
			return
		}

		// Generate tokens
		accessToken, err := auth.GenerateTokenWithPermissions(user.ID, user.Username, user.Email, user.DisplayName, user.Roles, user.Permissions)
		if err != nil {
			log.Printf("Error generating access token: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to generate token"})
			return
		}

		// Clear password hash from response
		user.PasswordHash = ""

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(models.AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: "",
			User:         user,
		})
	}
}

// handleRefreshToken handles token refresh
func handleRefreshToken(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req struct {
			RefreshToken string `json:"refresh_token"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
			return
		}

		claims, err := auth.ValidateToken(req.RefreshToken)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid refresh token"})
			return
		}

		// Always reload user from DB so any new permissions/roles are picked up
		user, err := appCtx.UserRepo.GetUserByID(claims.UserID)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "user not found"})
			return
		}

		// Generate new access token with fresh roles/permissions from DB
		accessToken, err := auth.GenerateTokenWithPermissions(user.ID, user.Username, user.Email, user.DisplayName, user.Roles, user.Permissions)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to generate token"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"access_token": accessToken,
		})
	}
}

// handleGetProfile returns the authenticated user's profile
func handleGetProfile(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		user, err := appCtx.UserRepo.GetUserByID(claims.UserID)
		if err != nil {
			log.Printf("Error fetching user: %v", err)
			// User no longer exists in DB (e.g. DB was wiped) — treat as unauthorized
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		user.PasswordHash = ""
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(user)
	}
}

// handleLogout handles user logout
func handleLogout(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Get claims from context (middleware should set this)
		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Log the logout
		log.Printf("User %s (%d) logged out", claims.Username, claims.UserID)

		// Return success (client will clear tokens from storage)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"message": "logged out successfully",
			"status":  "success",
		})
	}
}
