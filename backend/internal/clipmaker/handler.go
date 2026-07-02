package clipmaker

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
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

const maxProjectJSONBytes = 10 * 1024 * 1024
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
	r.With(jwt).Post("/clip-maker/export", h.exportClip)
	r.With(jwt).Get("/clip-maker/export/{token}/download", h.downloadTempExport)
}

func (h *Handler) exportClip(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxProjectJSONBytes)
	var req struct {
		Project  json.RawMessage `json:"project"`
		Filename string          `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid export request")
		return
	}
	if len(req.Project) == 0 || string(req.Project) == "null" {
		utils.WriteError(w, http.StatusBadRequest, "project is required")
		return
	}

	cleanupExpiredTempExports()

	project, rewrittenURLs, err := prepareProjectForRender(req.Project)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid project")
		return
	}

	startedAt := time.Now()
	log.Printf("clipmaker: export started user=%d filename=%q upload_urls_rewritten=%d", userID, req.Filename, rewrittenURLs)
	renderedPath, cleanup, direct, err := renderDirectUploadVideo(req.Project, userID)
	if !direct {
		renderedPath, cleanup, err = videorenderer.RenderVideo(project)
	} else if err == nil {
		log.Printf("clipmaker: direct upload export user=%d duration=%s", userID, time.Since(startedAt).Round(time.Millisecond))
	}
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		log.Printf("clipmaker: export failed user=%d duration=%s error=%v", userID, time.Since(startedAt).Round(time.Millisecond), err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	log.Printf("clipmaker: render completed user=%d duration=%s", userID, time.Since(startedAt).Round(time.Millisecond))

	info, err := os.Stat(renderedPath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "rendered file missing")
		return
	}
	filename := req.Filename
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

func prepareProjectForRender(project json.RawMessage) (json.RawMessage, int, error) {
	var value any
	if err := json.Unmarshal(project, &value); err != nil {
		return nil, 0, err
	}

	rewritten := 0
	baseURL := renderBaseURL()
	value = rewriteUploadURLs(value, baseURL, &rewritten)

	if rewritten == 0 {
		return project, 0, nil
	}

	bytes, err := json.Marshal(value)
	if err != nil {
		return nil, 0, err
	}

	return bytes, rewritten, nil
}

func rewriteUploadURLs(value any, baseURL string, rewritten *int) any {
	switch v := value.(type) {
	case map[string]any:
		for key, child := range v {
			v[key] = rewriteUploadURLs(child, baseURL, rewritten)
		}
		return v
	case []any:
		for i, child := range v {
			v[i] = rewriteUploadURLs(child, baseURL, rewritten)
		}
		return v
	case string:
		if strings.HasPrefix(v, "/uploads/") {
			*rewritten = *rewritten + 1
			return baseURL + v
		}
		return v
	default:
		return v
	}
}

func renderBaseURL() string {
	if value := strings.TrimRight(os.Getenv("SKAIA_RENDER_BASE_URL"), "/"); value != "" {
		return value
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}

	return "http://127.0.0.1:" + port
}

func renderDirectUploadVideo(project json.RawMessage, userID int64) (string, func(), bool, error) {
	src, ok, err := directUploadVideoSource(project, userID)
	if err != nil || !ok {
		return "", nil, ok, err
	}

	workDir, err := os.MkdirTemp("", "skaia-direct-export-*")
	if err != nil {
		return "", nil, true, fmt.Errorf("failed to create direct export workspace: %w", err)
	}

	cleanup := func() {
		_ = os.RemoveAll(workDir)
	}

	outFile := filepath.Join(workDir, fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano()))
	if err := copyFile(src, outFile); err != nil {
		cleanup()
		return "", nil, true, err
	}

	return outFile, cleanup, true, nil
}

func directUploadVideoSource(project json.RawMessage, userID int64) (string, bool, error) {
	var root any
	if err := json.Unmarshal(project, &root); err != nil {
		return "", false, err
	}

	input := renderInput(root)
	if input == nil {
		return "", false, nil
	}
	if input["watermark"] != nil {
		return "", false, nil
	}

	tracks, ok := input["tracks"].([]any)
	if !ok {
		return "", false, nil
	}

	var video map[string]any
	for _, trackValue := range tracks {
		track, ok := trackValue.(map[string]any)
		if !ok {
			return "", false, nil
		}
		elements, _ := track["elements"].([]any)
		if len(elements) == 0 {
			continue
		}
		if video != nil || len(elements) != 1 {
			return "", false, nil
		}
		element, ok := elements[0].(map[string]any)
		if !ok {
			return "", false, nil
		}
		video = element
	}

	if video == nil || stringValue(video["type"]) != "video" || numberValue(video["s"]) != 0 {
		return "", false, nil
	}
	if hasAny(video, "animation", "transition", "textEffect", "effect", "effects") || hasEditedFrame(video["frame"]) {
		return "", false, nil
	}

	props, _ := video["props"].(map[string]any)
	src := stringValue(props["src"])
	if src == "" || numberValue(props["time"]) != 0 || nonDefaultNumber(props["playbackRate"], 1) {
		return "", false, nil
	}

	if duration, ok := sourceDurationSeconds(root, src); ok && abs(numberValue(video["e"])-duration) > 0.25 {
		return "", false, nil
	}

	sourcePath, ok := localUserUploadVideoPath(src, userID)
	if !ok {
		return "", false, nil
	}

	return sourcePath, true, nil
}

func renderInput(root any) map[string]any {
	value, ok := root.(map[string]any)
	if !ok {
		return nil
	}
	if input, ok := value["input"].(map[string]any); ok {
		return input
	}
	return value
}

func localUserUploadVideoPath(src string, userID int64) (string, bool) {
	path := src
	if parsed, err := url.Parse(src); err == nil && parsed.Path != "" {
		path = parsed.Path
	}

	prefix := fmt.Sprintf("/uploads/users/%d/videos/", userID)
	if !strings.HasPrefix(path, prefix) || strings.Contains(path, "..") || strings.ToLower(filepath.Ext(path)) != ".mp4" {
		return "", false
	}

	candidate := "." + path
	absBase, err := filepath.Abs(upload.UploadsDir)
	if err != nil {
		return "", false
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return "", false
	}
	if absCandidate != absBase && !strings.HasPrefix(absCandidate, absBase+string(os.PathSeparator)) {
		return "", false
	}
	if info, err := os.Stat(absCandidate); err != nil || info.IsDir() {
		return "", false
	}

	return absCandidate, true
}

func sourceDurationSeconds(root any, src string) (float64, bool) {
	project, ok := root.(map[string]any)
	if !ok {
		return 0, false
	}
	assets, ok := project["assets"].(map[string]any)
	if !ok {
		if input, ok := project["input"].(map[string]any); ok {
			assets, _ = input["assets"].(map[string]any)
		}
	}
	for _, value := range assets {
		asset, ok := value.(map[string]any)
		if !ok || stringValue(asset["url"]) != src {
			continue
		}
		duration := numberValue(asset["duration"])
		if duration > 1000 {
			duration = duration / 1000
		}
		if duration > 0 {
			return duration, true
		}
	}
	return 0, false
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source video: %w", err)
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create direct export: %w", err)
	}

	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return fmt.Errorf("failed to copy source video: %w", err)
	}
	return out.Close()
}

func hasAny(value map[string]any, keys ...string) bool {
	for _, key := range keys {
		if value[key] != nil {
			return true
		}
	}
	return false
}

func hasEditedFrame(value any) bool {
	frame, ok := value.(map[string]any)
	if !ok {
		return false
	}
	return hasAny(frame, "x", "y", "rotation", "width", "height")
}

func stringValue(value any) string {
	str, _ := value.(string)
	return str
}

func numberValue(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	default:
		return 0
	}
}

func nonDefaultNumber(value any, defaultValue float64) bool {
	switch value.(type) {
	case nil:
		return false
	default:
		return numberValue(value) != defaultValue
	}
}

func abs(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
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
