package upload

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
)

// UserUpload represents a single upload returned to the frontend.
type UserUpload struct {
	URL       string    `json:"url"`
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	Type      string    `json:"type"` // "image", "video", "file", "banner", "photo"
	MimeType  string    `json:"mime_type"`
	CreatedAt time.Time `json:"created_at"`
}

// MountUserUploads registers user-upload management routes.
// These are separate from the core upload routes because they need the
// Authorizer for permission checks.
func MountUserUploads(r chi.Router, jwt func(http.Handler) http.Handler, authz utils.Authorizer, hub *ws.Hub) {
	r.With(jwt).Get("/upload/user/{id}", listUserUploads(authz))
	r.With(jwt).Delete("/upload/file", deleteUploadFile(authz, hub))
	r.With(jwt).Get("/upload/storage/{id}", getUserStorage())
}

// listUserUploads scans the filesystem for all uploads belonging to a user.
func listUserUploads(authz utils.Authorizer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		callerID, ok := utils.UserIDFromCtx(r)
		if !ok {
			utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid user id")
			return
		}

		// Any logged-in user can view another user's uploads,
		// but only the owner or an admin can delete them (enforced on delete).
		_ = callerID

		userDir := filepath.Join(UsersDir, strconv.FormatInt(targetID, 10))
		if _, err := os.Stat(userDir); os.IsNotExist(err) {
			utils.WriteJSON(w, http.StatusOK, []UserUpload{})
			return
		}

		var uploads []UserUpload

		// Walk all subdirectories: images, videos, files, banners, photos
		_ = filepath.Walk(userDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() {
				if info.Name() == "tmp" {
					return filepath.SkipDir
				}
				return nil
			}

			// Build the URL.
			rel, _ := filepath.Rel(".", path)
			url := "/" + filepath.ToSlash(rel)

			// Determine category from the parent directory.
			dir := filepath.Base(filepath.Dir(path))
			category := dir // "images", "videos", "files", "banners", "photos"

			// Derive MIME type from extension.
			ext := strings.ToLower(filepath.Ext(info.Name()))
			mimeType := extensionToMime(ext)

			uploads = append(uploads, UserUpload{
				URL:       url,
				Filename:  info.Name(),
				Size:      info.Size(),
				Type:      category,
				MimeType:  mimeType,
				CreatedAt: info.ModTime(),
			})
			return nil
		})

		// Sort newest first.
		sort.Slice(uploads, func(i, j int) bool {
			return uploads[i].CreatedAt.After(uploads[j].CreatedAt)
		})

		utils.WriteJSON(w, http.StatusOK, uploads)
	}
}

// deleteUploadFile deletes upload files. Body: {"url": "...", "urls": ["..."]}
func deleteUploadFile(authz utils.Authorizer, hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		callerID, ok := utils.UserIDFromCtx(r)
		if !ok {
			utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req struct {
			URL  string   `json:"url"`
			URLs []string `json:"urls"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid request")
			return
		}

		urls := req.URLs
		if req.URL != "" {
			urls = append(urls, req.URL)
		}

		if len(urls) == 0 {
			utils.WriteError(w, http.StatusBadRequest, "url or urls required")
			return
		}

		deletedAny := false
		for _, rawURL := range urls {
			// Validate URL format and extract the owner user ID.
			if !strings.HasPrefix(rawURL, "/uploads/users/") || strings.Contains(rawURL, "..") {
				continue
			}

			parts := strings.SplitN(strings.TrimPrefix(rawURL, "/uploads/users/"), "/", 2)
			if len(parts) < 2 {
				continue
			}
			ownerID, err := strconv.ParseInt(parts[0], 10, 64)
			if err != nil {
				continue
			}

			// Only the owner or an admin may delete.
			if callerID != ownerID {
				canManage, _ := authz.HasPermission(callerID, "user.manage-others")
				if !canManage {
					continue
				}
			}

			localPath := filepath.Join(UsersDir, strconv.FormatInt(ownerID, 10), parts[1])
			if err := os.Remove(localPath); err == nil {
				deletedAny = true
			}
		}

		if deletedAny {
			w.WriteHeader(http.StatusNoContent)
			hub.PropagateUser(callerID, map[string]interface{}{"action": "uploads_changed"})
		} else {
			utils.WriteError(w, http.StatusInternalServerError, "failed to delete files")
		}
	}
}

// extensionToMime maps common extensions to MIME types for display purposes.
func extensionToMime(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".ogg":
		return "video/ogg"
	case ".pdf":
		return "application/pdf"
	default:
		return "application/octet-stream"
	}
}

// getUserStorage returns upload quota usage for a user.
func getUserStorage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, ok := utils.UserIDFromCtx(r)
		if !ok {
			utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid user id")
			return
		}

		info := GetStorageInfo(targetID)
		utils.WriteJSON(w, http.StatusOK, info)
	}
}
