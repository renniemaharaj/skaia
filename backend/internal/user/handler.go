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
	"github.com/skaia/backend/models"
)

// Upload config — mirrors the global constants in handlers_files.go.
const (
	uploadsDir  = "./uploads"
	photosDir   = uploadsDir + "/photos"
	maxFileSize = 10 * 1024 * 1024 // 10 MB
)

// Handler owns the HTTP layer for the user domain.
// Wire it up via Mount once your chi.Router is created.
type Handler struct {
	svc *Service
}

// NewHandler returns a Handler backed by the given Service.
func NewHandler(svc *Service) *Handler {
	os.MkdirAll(photosDir, 0755) //nolint:errcheck
	return &Handler{svc: svc}
}

// Mount registers all user-domain routes onto r.
//
//	jwt     — middleware that requires a valid JWT (401 on missing/invalid).
//	optJWT  — middleware that enriches context when a JWT is present but passes through unauthenticated requests.
func (h *Handler) Mount(r chi.Router, jwt, optJWT func(http.Handler) http.Handler) {
	// Auth
	r.Route("/auth", func(r chi.Router) {
		r.Post("/register", h.register)
		r.Post("/login", h.login)
		r.Post("/refresh", h.refreshToken)
		r.With(jwt).Post("/logout", h.logout)
	})

	// Users
	r.Route("/users", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/profile", h.getProfile)
		r.Get("/search", h.searchUsers)
		r.Get("/{id}", h.getUser)
		r.Post("/", h.createUser)
		r.Put("/{id}", h.updateUser)
		r.Post("/{id}/permissions", h.addPermission)
		r.Delete("/{id}/permissions/{perm}", h.removePermission)
		r.Post("/me/photo", h.uploadProfilePhoto)
	})

	// Permissions catalogue
	r.Route("/permissions", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/", h.getPermissions)
	})
}

// Auth handlers

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, accessToken, refreshToken, err := h.svc.Register(&req)
	if err != nil {
		log.Printf("user.Handler.register: %v", err)
		switch {
		case strings.Contains(err.Error(), "required"):
			WriteError(w, http.StatusBadRequest, err.Error())
		case strings.Contains(err.Error(), "unique") ||
			strings.Contains(err.Error(), "duplicate") ||
			strings.Contains(err.Error(), "UNIQUE"):
			WriteError(w, http.StatusConflict, "user already exists")
		default:
			WriteError(w, http.StatusInternalServerError, "registration failed")
		}
		return
	}

	WriteJSON(w, http.StatusCreated, models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, accessToken, err := h.svc.Login(req.Email, req.Password)
	if err != nil {
		log.Printf("user.Handler.login: %v", err)
		var susp *SuspendedError
		switch {
		case errors.As(err, &susp):
			WriteJSON(w, http.StatusForbidden, map[string]string{
				"error":  "user account is suspended",
				"reason": susp.Reason,
			})
		case err.Error() == "user not found" ||
			err.Error() == "invalid credentials" ||
			err.Error() == "email and password required":
			WriteError(w, http.StatusUnauthorized, "invalid credentials")
		default:
			WriteError(w, http.StatusInternalServerError, "login failed")
		}
		return
	}

	WriteJSON(w, http.StatusOK, models.AuthResponse{
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
		WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}

	accessToken, err := h.svc.RefreshToken(req.RefreshToken)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"access_token": accessToken})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromCtx(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	log.Printf("user.Handler.logout: user %s (%d) signed out", claims.Username, claims.UserID)
	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "logged out successfully",
		"status":  "success",
	})
}

// User handlers

func (h *Handler) getUser(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	user, err := h.svc.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	user.PasswordHash = ""
	WriteJSON(w, http.StatusOK, user)
}

func (h *Handler) getProfile(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromCtx(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.svc.GetByID(claims.UserID)
	if err != nil {
		log.Printf("user.Handler.getProfile: %v", err)
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user.PasswordHash = ""
	WriteJSON(w, http.StatusOK, user)
}

func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
	// Placeholder — full admin-create flow can be added here.
	WriteJSON(w, http.StatusCreated, map[string]string{
		"message": "User created",
		"status":  "success",
	})
}

func (h *Handler) updateUser(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromCtx(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	// Only the owner or an admin may update.
	if claims.UserID != id && !HasClaim(claims, "admin") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	existing, err := h.svc.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "user not found")
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
		WriteError(w, http.StatusBadRequest, "invalid request body")
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
		WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	updated.PasswordHash = ""
	WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) searchUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		WriteError(w, http.StatusBadRequest, "search query required")
		return
	}

	users, err := h.svc.Search(q, 20, 0)
	if err != nil {
		log.Printf("user.Handler.searchUsers: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to search users")
		return
	}

	for _, u := range users {
		u.PasswordHash = ""
	}
	WriteJSON(w, http.StatusOK, users)
}

// Permission handlers

func (h *Handler) getPermissions(w http.ResponseWriter, r *http.Request) {
	perms, err := h.svc.GetAllPermissions()
	if err != nil {
		log.Printf("user.Handler.getPermissions: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to fetch permissions")
		return
	}
	WriteJSON(w, http.StatusOK, perms)
}

func (h *Handler) addPermission(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromCtx(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !HasClaim(claims, "user.manage-permissions") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	targetID, err := parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	var req struct {
		Permission string `json:"permission"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Permission == "" {
		WriteError(w, http.StatusBadRequest, "permission name required")
		return
	}

	if err := h.svc.AddPermission(targetID, req.Permission); err != nil {
		log.Printf("user.Handler.addPermission: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to add permission")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"status": "permission added"})
}

func (h *Handler) removePermission(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromCtx(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !HasClaim(claims, "user.manage-permissions") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	targetID, err := parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	permName := chi.URLParam(r, "perm")

	if err := h.svc.RemovePermission(targetID, permName); err != nil {
		log.Printf("user.Handler.removePermission: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to remove permission")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"status": "permission removed"})
}

// File handlers

// FileUploadResponse is returned after a successful upload.
type FileUploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

func (h *Handler) uploadProfilePhoto(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromCtx(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "photo field required")
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck

	filename := fmt.Sprintf("photo_%d_%d%s",
		claims.UserID, time.Now().UnixNano(), filepath.Ext(header.Filename),
	)
	dst, err := os.Create(filepath.Join(photosDir, filename))
	if err != nil {
		log.Printf("user.Handler.uploadProfilePhoto: create file: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()

	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(photosDir, filename)) //nolint:errcheck
		WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	u, err := h.svc.GetByID(claims.UserID)
	if err != nil {
		os.Remove(filepath.Join(photosDir, filename)) //nolint:errcheck
		WriteError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	u.PhotoURL = "/uploads/photos/" + filename
	if _, err = h.svc.Update(u); err != nil {
		os.Remove(filepath.Join(photosDir, filename)) //nolint:errcheck
		WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	WriteJSON(w, http.StatusCreated, FileUploadResponse{
		URL:      u.PhotoURL,
		Filename: filename,
		Size:     size,
		Type:     header.Header.Get("Content-Type"),
	})
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
	for _, allowed := range []string{"image/jpeg", "image/png"} {
		if ct == allowed {
			return nil
		}
	}
	return errors.New("only JPEG and PNG images are allowed")
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
