// Package upload provides HTTP handlers for file uploads (images, videos, files,
// banners) and static serving of the /uploads directory.
//
// All user content is stored under uploads/users/{userID}/{type}/ so each user
// has their own isolated folder and filenames never collide across users.
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
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

// Directory layout
const (
	UploadsDir  = "./uploads"
	UsersDir    = UploadsDir + "/users"
	MaxFileSize = 50 * 1024 * 1024 // 50 MB (videos)
	MaxImgSize  = 10 * 1024 * 1024 // 10 MB (images / banners)
)

// Upload quota limits — read from environment (bytes).
var (
	MaxUploadPerUser int64 = 500 * 1024 * 1024  // MAX_UPLOAD_PER_USER_MB
	MaxUploadTotal   int64 = 5000 * 1024 * 1024 // MAX_UPLOAD_TOTAL_MB
)

func init() {
	if v := os.Getenv("MAX_UPLOAD_PER_USER_MB"); v != "" {
		if mb, err := strconv.ParseInt(v, 10, 64); err == nil && mb > 0 {
			MaxUploadPerUser = mb * 1024 * 1024
		}
	}
	if v := os.Getenv("MAX_UPLOAD_TOTAL_MB"); v != "" {
		if mb, err := strconv.ParseInt(v, 10, 64); err == nil && mb > 0 {
			MaxUploadTotal = mb * 1024 * 1024
		}
	}
}

// DirSize returns the total size of all files under a directory (recursive).
func DirSize(path string) (int64, error) {
	var total int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		total += info.Size()
		return nil
	})
	return total, err
}

// CheckUserQuota returns an error string if the user would exceed their per-user quota.
func CheckUserQuota(userID int64) string {
	if MaxUploadPerUser <= 0 {
		return ""
	}
	dir := filepath.Join(UsersDir, strconv.FormatInt(userID, 10))
	used, _ := DirSize(dir)
	if used >= MaxUploadPerUser {
		return fmt.Sprintf("upload quota exceeded (used %s of %s)",
			humanSize(used), humanSize(MaxUploadPerUser))
	}
	return ""
}

// CheckTotalQuota returns an error string if the backend-wide quota would be exceeded.
func CheckTotalQuota() string {
	if MaxUploadTotal <= 0 {
		return ""
	}
	used, _ := DirSize(UploadsDir)
	if used >= MaxUploadTotal {
		return fmt.Sprintf("backend storage limit reached (%s of %s)",
			humanSize(used), humanSize(MaxUploadTotal))
	}
	return ""
}

// StorageInfo holds quota usage information.
type StorageInfo struct {
	UserUsed     int64   `json:"user_used"`
	UserLimit    int64   `json:"user_limit"`
	UserPercent  float64 `json:"user_percent"`
	TotalUsed    int64   `json:"total_used"`
	TotalLimit   int64   `json:"total_limit"`
	TotalPercent float64 `json:"total_percent"`
	UserHuman    string  `json:"user_used_human"`
	UserLimitH   string  `json:"user_limit_human"`
	TotalHuman   string  `json:"total_used_human"`
	TotalLimitH  string  `json:"total_limit_human"`
}

// GetStorageInfo returns quota usage for a specific user and the total backend.
func GetStorageInfo(userID int64) StorageInfo {
	userDir := filepath.Join(UsersDir, strconv.FormatInt(userID, 10))
	userUsed, _ := DirSize(userDir)
	totalUsed, _ := DirSize(UploadsDir)

	info := StorageInfo{
		UserUsed:    userUsed,
		UserLimit:   MaxUploadPerUser,
		TotalUsed:   totalUsed,
		TotalLimit:  MaxUploadTotal,
		UserHuman:   humanSize(userUsed),
		UserLimitH:  humanSize(MaxUploadPerUser),
		TotalHuman:  humanSize(totalUsed),
		TotalLimitH: humanSize(MaxUploadTotal),
	}
	if MaxUploadPerUser > 0 {
		info.UserPercent = float64(userUsed) / float64(MaxUploadPerUser) * 100
	}
	if MaxUploadTotal > 0 {
		info.TotalPercent = float64(totalUsed) / float64(MaxUploadTotal) * 100
	}
	return info
}

// GetTotalStorageInfo returns backend-wide storage usage (no user-specific data).
func GetTotalStorageInfo() StorageInfo {
	totalUsed, _ := DirSize(UploadsDir)
	info := StorageInfo{
		TotalUsed:   totalUsed,
		TotalLimit:  MaxUploadTotal,
		TotalHuman:  humanSize(totalUsed),
		TotalLimitH: humanSize(MaxUploadTotal),
	}
	if MaxUploadTotal > 0 {
		info.TotalPercent = float64(totalUsed) / float64(MaxUploadTotal) * 100
	}
	return info
}

// humanSize formats bytes as a human-readable string.
func humanSize(b int64) string {
	const (
		kb = 1024
		mb = kb * 1024
		gb = mb * 1024
	)
	switch {
	case b >= gb:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(gb))
	case b >= mb:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(mb))
	case b >= kb:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(kb))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

var (
	AllowedImageTypes = []string{"image/jpeg", "image/png", "image/webp", "image/gif"}
	AllowedVideoTypes = []string{"video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"}
)

// UploadResponse is returned on a successful upload.
type UploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

// Handler owns the upload and static-serve HTTP endpoints.
type Handler struct{}

// NewHandler creates a Handler and ensures the base user-uploads directory exists.
func NewHandler() *Handler {
	os.MkdirAll(UsersDir, 0755)
	return &Handler{}
}

// Mount registers all upload routes on r.
//
//	jwt — middleware that requires a valid JWT.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	// Static file serving for uploaded assets.
	r.Get("/uploads/*", ServeUploads)

	// All upload endpoints require authentication.
	r.Group(func(r chi.Router) {
		r.Use(jwt)
		r.Post("/upload/image", h.uploadImage)
		r.Post("/upload/video", h.uploadVideo)
		r.Post("/upload/file", h.uploadFile)
		r.Post("/upload/banner", h.uploadBanner)
	})
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

// uploadImage handles editor image uploads (JPEG, PNG, WEBP, GIF, ≤10 MB).
func (h *Handler) uploadImage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if msg := CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(MaxImgSize); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to parse form"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "file field required"})
		return
	}
	defer file.Close()

	ct := detectContentType(file, header)
	if !typeAllowed(ct, AllowedImageTypes) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "only JPEG, PNG, WEBP, and GIF images are allowed"})
		return
	}
	file.Seek(0, 0)

	dir, err := userDir(userID, "images")
	if err != nil {
		log.Printf("upload: mkdir images: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to create upload directory"})
		return
	}

	ext := sanitizeExt(header.Filename)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)

	url, size, err := saveFile(file, dir, filename, userID, "images")
	if err != nil {
		log.Printf("upload: save image: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UploadResponse{URL: url, Filename: filename, Size: size, Type: ct})
}

// uploadVideo handles editor video uploads (MP4, WEBM, OGG, ≤50 MB).
func (h *Handler) uploadVideo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if msg := CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(MaxFileSize); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to parse form"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "file field required"})
		return
	}
	defer file.Close()

	ct := detectContentType(file, header)
	if !typeAllowed(ct, AllowedVideoTypes) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "only MP4, WEBM, and OGG videos are allowed"})
		return
	}
	file.Seek(0, 0)

	dir, err := userDir(userID, "videos")
	if err != nil {
		log.Printf("upload: mkdir videos: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to create upload directory"})
		return
	}

	ext := sanitizeExt(header.Filename)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)

	url, size, err := saveFile(file, dir, filename, userID, "videos")
	if err != nil {
		log.Printf("upload: save video: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UploadResponse{URL: url, Filename: filename, Size: size, Type: ct})
}

// uploadFile handles generic editor file/attachment uploads (≤50 MB).
func (h *Handler) uploadFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if msg := CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(MaxFileSize); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to parse form"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "file field required"})
		return
	}
	defer file.Close()

	dir, err := userDir(userID, "files")
	if err != nil {
		log.Printf("upload: mkdir files: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to create upload directory"})
		return
	}

	ct := mime.TypeByExtension(filepath.Ext(header.Filename))
	if ct == "" {
		ct = "application/octet-stream"
	}

	// Include the sanitised original name so it is human-readable.
	safe := sanitizeName(header.Filename)
	filename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safe)

	url, size, err := saveFile(file, dir, filename, userID, "files")
	if err != nil {
		log.Printf("upload: save file: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UploadResponse{URL: url, Filename: filename, Size: size, Type: ct})
}

// uploadBanner handles thread-banner image uploads.
// The caller must have the "forum.new-thread" permission.
// Banners are stored under the uploading user's folder: users/{id}/banners/.
func (h *Handler) uploadBanner(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if msg := CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(MaxImgSize); err != nil {
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

	ct := detectContentType(file, header)
	if !typeAllowed(ct, AllowedImageTypes) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "only JPEG, PNG, WEBP, and GIF images are allowed"})
		return
	}
	file.Seek(0, 0)

	if err := validateBannerDimensions(file); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	file.Seek(0, 0)

	dir, err := userDir(userID, "banners")
	if err != nil {
		log.Printf("upload: mkdir banners: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to create upload directory"})
		return
	}

	ext := sanitizeExt(header.Filename)
	filename := fmt.Sprintf("banner_%d%s", time.Now().UnixNano(), ext)

	url, size, err := saveFile(file, dir, filename, userID, "banners")
	if err != nil {
		log.Printf("upload: save banner: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "failed to save file"})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UploadResponse{
		URL:      url,
		Filename: filename,
		Size:     size,
		Type:     ct,
	})
}

// Internal helpers

// userDir returns (and creates) ./uploads/users/{userID}/{subdir}.
func userDir(userID int64, subdir string) (string, error) {
	dir := filepath.Join(UsersDir, strconv.FormatInt(userID, 10), subdir)
	return dir, os.MkdirAll(dir, 0755)
}

// saveFile writes src to dir/filename and returns the public URL.
func saveFile(src io.Reader, dir, filename string, userID int64, subdir string) (url string, size int64, err error) {
	dst, err := os.Create(filepath.Join(dir, filename))
	if err != nil {
		return "", 0, err
	}
	defer dst.Close()

	size, err = io.Copy(dst, src)
	if err != nil {
		os.Remove(filepath.Join(dir, filename))
		return "", 0, err
	}

	url = fmt.Sprintf("/uploads/users/%d/%s/%s", userID, subdir, filename)
	return url, size, nil
}

// detectContentType sniffs the MIME type from the first 512 bytes of file,
// falling back to the Content-Type header supplied by the browser.
func detectContentType(file multipart.File, header *multipart.FileHeader) string {
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	file.Seek(0, 0)
	ct := http.DetectContentType(buf[:n])
	// http.DetectContentType may return "application/octet-stream" for exotic
	// types; prefer the browser-supplied header when it is more specific.
	if ct == "application/octet-stream" {
		if bct := header.Header.Get("Content-Type"); bct != "" {
			ct = bct
		}
	}
	return ct
}

// sanitizeExt returns a lower-case file extension (e.g. ".jpg") or ".bin".
func sanitizeExt(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return ".bin"
	}
	return ext
}

// sanitizeName strips directory separators from a filename so it is safe
// to embed in a path directly.
func sanitizeName(name string) string {
	return filepath.Base(name)
}

// typeAllowed reports whether ct is present in the allowed list.
func typeAllowed(ct string, allowed []string) bool {
	for _, a := range allowed {
		if ct == a {
			return true
		}
	}
	return false
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
