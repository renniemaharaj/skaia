// Package upload provides HTTP handlers for file uploads (banners, etc.) and
// static serving of the /uploads directory.
package upload

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

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/auth"
)

// Directory layout
const (
	UploadsDir  = "./uploads"
	BannersDir  = UploadsDir + "/banners"
	MaxFileSize = 10 * 1024 * 1024 // 10 MB
)

var AllowedTypes = []string{"image/jpeg", "image/png", "image/webp", "image/gif"}

// UploadResponse is returned on a successful upload.
type UploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

// Handler owns the upload and static-serve HTTP endpoints.
type Handler struct{}

// NewHandler creates a Handler and ensures the upload directories exist.
func NewHandler() *Handler {
	os.MkdirAll(BannersDir, 0755)
	return &Handler{}
}

// Mount registers all upload routes on r.
//
//	jwt — middleware that requires a valid JWT.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	// Static file serving for uploaded assets.
	r.Get("/uploads/*", ServeUploads)

	// Banner upload — requires forum.new-thread permission.
	r.With(jwt).Post("/upload/banner", h.uploadBanner)
}

// ServeUploads serves files from the uploads directory.
// It guards against directory-traversal attacks.
func ServeUploads(w http.ResponseWriter, r *http.Request) {
	fp := "." + r.URL.Path
	if strings.Contains(fp, "..") {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	http.ServeFile(w, r, fp)
}

// uploadBanner handles thread-banner image uploads.
// The caller must have the "forum.new-thread" permission.
func (h *Handler) uploadBanner(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims, ok := r.Context().Value("claims").(*auth.Claims)
	if !ok || claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	if !hasClaim(claims, "forum.new-thread") {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
		return
	}

	if err := r.ParseMultipartForm(MaxFileSize); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to parse form"})
		return
	}

	file, header, err := r.FormFile("banner")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "banner field required"})
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	file.Seek(0, 0)

	if err := validateBannerDimensions(file); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	file.Seek(0, 0)

	filename := fmt.Sprintf("banner_%d_%d%s",
		claims.UserID, time.Now().UnixNano(), filepath.Ext(header.Filename),
	)
	dst, err := os.Create(filepath.Join(BannersDir, filename))
	if err != nil {
		log.Printf("upload: create banner file: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
		return
	}
	defer dst.Close()

	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(BannersDir, filename))
		log.Printf("upload: copy banner file: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UploadResponse{
		URL:      "/uploads/banners/" + filename,
		Filename: filename,
		Size:     size,
		Type:     header.Header.Get("Content-Type"),
	})
}

// ── internal helpers ─────────────────────────────────────────────────────────

// hasClaim reports whether claims contains the given permission or the "admin" role.
func hasClaim(claims *auth.Claims, permission string) bool {
	for _, r := range claims.Roles {
		if r == "admin" {
			return true
		}
	}
	for _, p := range claims.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

// validateImageFile checks that the uploaded file is a JPEG, PNG, WEBP, or GIF.
func validateImageFile(file io.Reader, headers map[string][]string) error {
	ct := ""
	if vals, ok := headers["Content-Type"]; ok && len(vals) > 0 {
		ct = vals[0]
	}
	for _, allowed := range AllowedTypes {
		if ct == allowed {
			return nil
		}
	}
	return errors.New("only JPEG, PNG, WEBP, and GIF images are allowed")
}

// validateBannerDimensions requires exactly 350px height.
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
