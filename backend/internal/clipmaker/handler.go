package clipmaker

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	log "github.com/skaia/backend/internal/syslog"
	"github.com/skaia/backend/internal/upload"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/videorenderer"
	"github.com/skaia/backend/internal/ws"
)

const maxBrowserExportBytes = 512 * 1024 * 1024
const tempExportTTL = time.Hour

var tempCleanupOnce sync.Once

type Handler struct {
	hub *ws.Hub
}

func NewHandler(hub *ws.Hub) *Handler {
	tempCleanupOnce.Do(func() {
		go cleanupTempExportsLoop()
	})
	return &Handler{hub: hub}
}

func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.With(jwt).Post("/clip-maker/export", h.exportBrowserClip)
	r.With(jwt).Get("/clip-maker/export/{token}/download", h.downloadTempExport)
}

func (h *Handler) exportBrowserClip(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBrowserExportBytes)
	if err := r.ParseMultipartForm(maxBrowserExportBytes); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid browser export upload")
		return
	}

	file, header, err := r.FormFile("recording")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "recording is required")
		return
	}
	defer file.Close()

	buf := make([]byte, 32)
	n, _ := file.Read(buf)

	log.Printf(
		"upload size=%d first bytes=% x",
		header.Size,
		buf[:n],
	)

	_, _ = file.Seek(0, io.SeekStart)

	filename := r.FormValue("filename")
	if filename == "" && header != nil {
		filename = header.Filename
	}

	width := positiveFormInt(r, "width", 1920)
	height := positiveFormInt(r, "height", 1080)
	fps := positiveFormInt(r, "fps", 30)

	startedAt := time.Now()
	log.Printf("clipmaker: browser export started user=%d filename=%q width=%d height=%d fps=%d", userID, filename, width, height, fps)

	renderedPath, cleanup, err := videorenderer.FinalizeBrowserRecording(file, videorenderer.BrowserRecordingOptions{
		Width:  width,
		Height: height,
		FPS:    fps,
	})
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		log.Printf("clipmaker: browser export failed user=%d duration=%s error=%v", userID, time.Since(startedAt).Round(time.Millisecond), err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	log.Printf("clipmaker: browser export finalized user=%d duration=%s", userID, time.Since(startedAt).Round(time.Millisecond))
	h.writeRenderedExport(w, userID, renderedPath, filename, startedAt)
}

func (h *Handler) writeRenderedExport(w http.ResponseWriter, userID int64, renderedPath, requestedFilename string, startedAt time.Time) {
	info, err := os.Stat(renderedPath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "rendered file missing")
		return
	}
	filename := requestedFilename
	if filename == "" {
		filename = fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano())
	}

	if msg := upload.CheckUserQuota(userID, info.Size()); msg != "" {
		h.writeTemporaryExport(w, userID, renderedPath, filename, info.Size(), msg)
		return
	}
	if msg := upload.CheckTotalQuota(info.Size()); msg != "" {
		h.writeTemporaryExport(w, userID, renderedPath, filename, info.Size(), msg)
		return
	}

	file, err := os.Open(renderedPath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to open rendered file")
		return
	}
	defer file.Close()

	res, err := upload.SaveGeneratedVideo(file, userID, filename)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to save rendered file")
		return
	}

	h.hub.PropagateUser(userID, map[string]interface{}{"action": "uploads_changed"})
	log.Printf("clipmaker: export saved user=%d filename=%q size=%d total_duration=%s", userID, res.Filename, res.Size, time.Since(startedAt).Round(time.Millisecond))
	utils.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"saved":    true,
		"filename": res.Filename,
		"size":     res.Size,
		"type":     res.Type,
		"url":      res.URL,
	})
}

func positiveFormInt(r *http.Request, key string, fallback int) int {
	value := strings.TrimSpace(r.FormValue(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func (h *Handler) writeTemporaryExport(w http.ResponseWriter, userID int64, renderedPath, filename string, size int64, reason string) {
	tmp, err := createTemporaryExport(userID, renderedPath, filename, size, reason)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to prepare temporary download")
		return
	}

	utils.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"saved":        false,
		"temporary":    true,
		"filename":     tmp.Filename,
		"size":         tmp.Size,
		"type":         "video/mp4",
		"download_url": fmt.Sprintf("/clip-maker/export/%s/download", tmp.Token),
		"expires_at":   tmp.ExpiresAt,
		"quota_error":  reason,
	})
}

func (h *Handler) downloadTempExport(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	cleanupExpiredTempExports()

	token := chi.URLParam(r, "token")
	meta, err := readTemporaryExport(token)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "export not found or expired")
		return
	}
	if meta.UserID != userID {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	if time.Now().After(meta.ExpiresAt) {
		_ = os.RemoveAll(tempExportPath(token))
		utils.WriteError(w, http.StatusGone, "export expired")
		return
	}

	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": meta.Filename}))
	http.ServeFile(w, r, tempExportFilePath(token))
}

type temporaryExport struct {
	Token     string    `json:"token"`
	UserID    int64     `json:"user_id"`
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

func createTemporaryExport(userID int64, srcPath, filename string, size int64, reason string) (temporaryExport, error) {
	token := uuid.NewString()
	now := time.Now()
	meta := temporaryExport{
		Token:     token,
		UserID:    userID,
		Filename:  safeDownloadFilename(filename),
		Size:      size,
		Reason:    reason,
		CreatedAt: now,
		ExpiresAt: now.Add(tempExportTTL),
	}

	dir := tempExportPath(token)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return temporaryExport{}, err
	}

	src, err := os.Open(srcPath)
	if err != nil {
		_ = os.RemoveAll(dir)
		return temporaryExport{}, err
	}
	defer src.Close()

	dst, err := os.Create(tempExportFilePath(token))
	if err != nil {
		_ = os.RemoveAll(dir)
		return temporaryExport{}, err
	}
	if _, err = io.Copy(dst, src); err != nil {
		_ = dst.Close()
		_ = os.RemoveAll(dir)
		return temporaryExport{}, err
	}
	if err = dst.Close(); err != nil {
		_ = os.RemoveAll(dir)
		return temporaryExport{}, err
	}

	metaBytes, err := json.Marshal(meta)
	if err != nil {
		_ = os.RemoveAll(dir)
		return temporaryExport{}, err
	}
	if err := os.WriteFile(filepath.Join(dir, "meta.json"), metaBytes, 0600); err != nil {
		_ = os.RemoveAll(dir)
		return temporaryExport{}, err
	}

	return meta, nil
}

func readTemporaryExport(token string) (temporaryExport, error) {
	if !validTempExportToken(token) {
		return temporaryExport{}, os.ErrNotExist
	}
	metaBytes, err := os.ReadFile(filepath.Join(tempExportPath(token), "meta.json"))
	if err != nil {
		return temporaryExport{}, err
	}
	var meta temporaryExport
	if err := json.Unmarshal(metaBytes, &meta); err != nil {
		return temporaryExport{}, err
	}
	return meta, nil
}

func cleanupTempExportsLoop() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cleanupExpiredTempExports()
	}
}

func cleanupExpiredTempExports() {
	root := tempExportsRoot()
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}

	now := time.Now()
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(root, entry.Name())
		metaBytes, err := os.ReadFile(filepath.Join(path, "meta.json"))
		if err != nil {
			removeOldTempExport(path, now)
			continue
		}
		var meta temporaryExport
		if err := json.Unmarshal(metaBytes, &meta); err != nil || now.After(meta.ExpiresAt) {
			_ = os.RemoveAll(path)
		}
	}
}

func removeOldTempExport(path string, now time.Time) {
	info, err := os.Stat(path)
	if err == nil && now.Sub(info.ModTime()) > tempExportTTL {
		_ = os.RemoveAll(path)
	}
}

func tempExportsRoot() string {
	return filepath.Join(upload.UploadsDir, "tmp", "clipmaker-exports")
}

func tempExportPath(token string) string {
	return filepath.Join(tempExportsRoot(), token)
}

func tempExportFilePath(token string) string {
	return filepath.Join(tempExportPath(token), "clip.mp4")
}

func validTempExportToken(token string) bool {
	if token == "" || strings.Contains(token, "..") || strings.ContainsAny(token, `/\`) {
		return false
	}
	_, err := uuid.Parse(token)
	return err == nil
}

func safeDownloadFilename(filename string) string {
	filename = filepath.Base(filename)
	if filename == "." || filename == string(filepath.Separator) || filename == "" {
		filename = fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano())
	}
	ext := strings.ToLower(filepath.Ext(filename))
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	if base == "" {
		base = "clip-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	if ext != ".mp4" {
		ext = ".mp4"
	}
	return base + ext
}
