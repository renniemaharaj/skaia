package main

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
	"strings"
	"time"

	"github.com/skaia/backend/auth"
)

// FileUploadResponse represents a successful file upload response
type FileUploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

// Upload directory configuration
const (
	UploadsDir  = "./uploads"
	PhotosDir   = UploadsDir + "/photos"
	BannersDir  = UploadsDir + "/banners"
	MaxFileSize = 10 * 1024 * 1024 // 10MB
)

func init() {
	// Create upload directories if they don't exist
	os.MkdirAll(PhotosDir, 0755)
	os.MkdirAll(BannersDir, 0755)
}

// handleUploadProfilePhoto handles user profile photo uploads
func handleUploadProfilePhoto(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)
		if claims == nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Parse multipart form
		if err := r.ParseMultipartForm(MaxFileSize); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to parse form"})
			return
		}

		file, handler, err := r.FormFile("photo")
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "photo field required"})
			return
		}
		defer file.Close()

		// Validate file type and size
		if err := validateImageFile(file, handler.Header); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Reset file pointer after validation
		file.Seek(0, 0)

		// Save file
		filename := fmt.Sprintf("photo_%s_%d%s",
			claims.UserID.String(),
			time.Now().UnixNano(),
			filepath.Ext(handler.Filename),
		)

		filepath := filepath.Join(PhotosDir, filename)
		dst, err := os.Create(filepath)
		if err != nil {
			log.Printf("Failed to create file: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
			return
		}
		defer dst.Close()

		size, err := io.Copy(dst, file)
		if err != nil {
			log.Printf("Failed to copy file: %v", err)
			os.Remove(filepath)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
			return
		}

		// Update user profile photo URL in database
		user, err := appCtx.UserRepo.GetUserByID(claims.UserID)
		if err != nil {
			os.Remove(filepath)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to load user"})
			return
		}

		user.PhotoURL = "/uploads/photos/" + filename
		_, err = appCtx.UserRepo.UpdateUser(user)
		if err != nil {
			os.Remove(filepath)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to update user"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(FileUploadResponse{
			URL:      user.PhotoURL,
			Filename: filename,
			Size:     size,
			Type:     handler.Header.Get("Content-Type"),
		})
	}
}

// handleUploadThreadBanner handles thread banner uploads
func handleUploadThreadBanner(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)
		if claims == nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Check permission
		if !hasPermission(claims, "forum.new-thread") {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
			return
		}

		// Parse multipart form
		if err := r.ParseMultipartForm(MaxFileSize); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to parse form"})
			return
		}

		file, handler, err := r.FormFile("banner")
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "banner field required"})
			return
		}
		defer file.Close()

		// Validate file type and size
		if err := validateImageFile(file, handler.Header); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Reset file pointer after validation
		file.Seek(0, 0)

		// Validate banner dimensions (height should be 350px)
		if err := validateBannerDimensions(file); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Reset file pointer again
		file.Seek(0, 0)

		// Save file
		filename := fmt.Sprintf("banner_%s_%d%s",
			claims.UserID.String(),
			time.Now().UnixNano(),
			filepath.Ext(handler.Filename),
		)

		filepath := filepath.Join(BannersDir, filename)
		dst, err := os.Create(filepath)
		if err != nil {
			log.Printf("Failed to create file: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
			return
		}
		defer dst.Close()

		size, err := io.Copy(dst, file)
		if err != nil {
			log.Printf("Failed to copy file: %v", err)
			os.Remove(filepath)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(FileUploadResponse{
			URL:      "/uploads/banners/" + filename,
			Filename: filename,
			Size:     size,
			Type:     handler.Header.Get("Content-Type"),
		})
	}
}

// validateImageFile checks file type and size
func validateImageFile(file io.Reader, headers map[string][]string) error {
	contentType := ""
	if ct, ok := headers["Content-Type"]; ok && len(ct) > 0 {
		contentType = ct[0]
	}

	// Check MIME type (JPEG and PNG are standard, WebP support varies)
	allowedTypes := []string{"image/jpeg", "image/png"}
	isAllowed := false
	for _, allowed := range allowedTypes {
		if contentType == allowed {
			isAllowed = true
			break
		}
	}
	if !isAllowed {
		return errors.New("only JPEG and PNG images are allowed")
	}

	return nil
}

// validateBannerDimensions checks if banner height is 350px
func validateBannerDimensions(file io.Reader) error {
	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return errors.New("failed to read image dimensions")
	}

	if config.Height != 350 {
		return fmt.Errorf("banner height must be 350px, got %dpx", config.Height)
	}

	return nil
}

// hasPermission checks if a user has a permission
func hasPermission(claims *auth.Claims, permission string) bool {
	for _, perm := range claims.Permissions {
		if perm == permission {
			return true
		}
	}
	// Admins have all permissions
	for _, role := range claims.Roles {
		if role == "admin" {
			return true
		}
	}
	return false
}

// ServeUploadedFiles serves static files from uploads directory
func handleServeUploads(w http.ResponseWriter, r *http.Request) {
	// Remove /uploads prefix to get the file path
	filepath := "." + r.URL.Path

	// Prevent directory traversal attacks
	if strings.Contains(filepath, "..") {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	// Serve the file
	http.ServeFile(w, r, filepath)
}
