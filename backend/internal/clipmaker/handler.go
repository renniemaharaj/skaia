package clipmaker

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	_ "image/png"
	"io"
	"math"
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
const maxAudioTrackBytes = 128 * 1024 * 1024
const maxAudioTracks = 32
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
	r.With(jwt).Post("/clipmaker/export", h.exportBrowserClip)
	r.With(jwt).Post("/clipmaker/export/frames", h.exportFrameStream)
	r.With(jwt).Get("/clipmaker/export/{token}/download", h.downloadTempExport)
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

type frameStreamMeta struct {
	Type            string  `json:"type"`
	Filename        string  `json:"filename"`
	FPS             int     `json:"fps"`
	Width           int     `json:"width"`
	Height          int     `json:"height"`
	DurationSeconds float64 `json:"duration_seconds"`
	TotalFrames     int     `json:"total_frames"`
	AudioTracks     int     `json:"audio_tracks"`
}

type frameStreamHeader struct {
	Type        string  `json:"type"`
	Index       int     `json:"index"`
	TimeSeconds float64 `json:"time_seconds"`
	ContentType string  `json:"content_type"`
	ByteLength  int64   `json:"byte_length"`
}

type audioStreamHeader struct {
	Type         string  `json:"type"`
	Index        int     `json:"index"`
	StartSeconds float64 `json:"start_seconds"`
	EndSeconds   float64 `json:"end_seconds"`
	TrimSeconds  float64 `json:"trim_seconds"`
	PlaybackRate float64 `json:"playback_rate"`
	Volume       float64 `json:"volume"`
	ContentType  string  `json:"content_type"`
	ByteLength   int64   `json:"byte_length"`
}

func (h *Handler) exportFrameStream(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBrowserExportBytes)
	defer r.Body.Close()

	startedAt := time.Now()
	reader := bufio.NewReaderSize(r.Body, 1024*1024)
	meta, err := readFrameStreamMeta(reader)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	workDir, audioTracks, cleanup, err := writeFrameStreamMedia(reader, meta)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	log.Printf("clipmaker: frame stream export started user=%d filename=%q width=%d height=%d fps=%d frames=%d", userID, meta.Filename, meta.Width, meta.Height, meta.FPS, meta.TotalFrames)
	renderedPath, renderCleanup, err := videorenderer.FinalizePNGFrames(workDir, videorenderer.FrameRenderOptions{
		Width:       meta.Width,
		Height:      meta.Height,
		FPS:         meta.FPS,
		TotalFrames: meta.TotalFrames,
		AudioTracks: audioTracks,
	})
	if renderCleanup != nil {
		defer renderCleanup()
	}
	if err != nil {
		log.Printf("clipmaker: frame stream export failed user=%d duration=%s error=%v", userID, time.Since(startedAt).Round(time.Millisecond), err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	log.Printf("clipmaker: frame stream export finalized user=%d duration=%s", userID, time.Since(startedAt).Round(time.Millisecond))
	h.writeRenderedExport(w, userID, renderedPath, meta.Filename, startedAt)
}

func readFrameStreamMeta(reader *bufio.Reader) (frameStreamMeta, error) {
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return frameStreamMeta{}, fmt.Errorf("missing frame stream metadata")
	}

	var meta frameStreamMeta
	if err := json.Unmarshal(bytes.TrimSpace(line), &meta); err != nil {
		return frameStreamMeta{}, fmt.Errorf("invalid frame stream metadata")
	}
	if meta.Type != "meta" {
		return frameStreamMeta{}, fmt.Errorf("first frame stream record must be metadata")
	}
	if meta.FPS <= 0 || meta.FPS > 120 {
		return frameStreamMeta{}, fmt.Errorf("invalid frame stream fps")
	}
	if meta.Width <= 0 || meta.Height <= 0 || meta.Width > 7680 || meta.Height > 4320 {
		return frameStreamMeta{}, fmt.Errorf("invalid frame stream dimensions")
	}
	if meta.TotalFrames <= 0 || meta.TotalFrames > meta.FPS*60*10 {
		return frameStreamMeta{}, fmt.Errorf("invalid frame stream frame count")
	}
	if math.IsNaN(meta.DurationSeconds) || math.IsInf(meta.DurationSeconds, 0) || meta.DurationSeconds <= 0 || meta.DurationSeconds > 600 {
		return frameStreamMeta{}, fmt.Errorf("invalid frame stream duration")
	}
	if meta.AudioTracks < 0 || meta.AudioTracks > maxAudioTracks {
		return frameStreamMeta{}, fmt.Errorf("invalid audio track count")
	}
	if meta.Filename == "" {
		meta.Filename = fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano())
	}
	return meta, nil
}

func writeFrameStreamMedia(reader *bufio.Reader, meta frameStreamMeta) (string, []videorenderer.AudioTrack, func(), error) {
	workDir, err := os.MkdirTemp("", "skaia-frame-export-*")
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to create frame export workspace")
	}
	cleanup := func() {
		_ = os.RemoveAll(workDir)
	}

	framesDir := filepath.Join(workDir, "frames")
	if err := os.MkdirAll(framesDir, 0755); err != nil {
		cleanup()
		return "", nil, nil, fmt.Errorf("failed to create frame workspace")
	}

	for expectedIndex := 0; expectedIndex < meta.TotalFrames; expectedIndex++ {
		header, err := readFrameHeader(reader)
		if err != nil {
			cleanup()
			return "", nil, nil, err
		}
		if header.Type != "frame" || header.Index != expectedIndex {
			cleanup()
			return "", nil, nil, fmt.Errorf("invalid frame order at frame %d", expectedIndex)
		}
		if header.ContentType != "" && header.ContentType != "image/png" {
			cleanup()
			return "", nil, nil, fmt.Errorf("frame %d must be image/png", expectedIndex)
		}
		if header.ByteLength <= 0 || header.ByteLength > 64*1024*1024 {
			cleanup()
			return "", nil, nil, fmt.Errorf("invalid frame %d byte length", expectedIndex)
		}

		frameBytes := make([]byte, header.ByteLength)
		if _, err := io.ReadFull(reader, frameBytes); err != nil {
			cleanup()
			return "", nil, nil, fmt.Errorf("frame %d is incomplete", expectedIndex)
		}
		if err := consumeFrameDelimiter(reader); err != nil {
			cleanup()
			return "", nil, nil, fmt.Errorf("frame %d delimiter missing", expectedIndex)
		}
		if err := validatePNGFrame(frameBytes, meta.Width, meta.Height, expectedIndex); err != nil {
			cleanup()
			return "", nil, nil, err
		}

		framePath := filepath.Join(framesDir, fmt.Sprintf("frame-%06d.png", expectedIndex))
		if err := os.WriteFile(framePath, frameBytes, 0644); err != nil {
			cleanup()
			return "", nil, nil, fmt.Errorf("failed to write frame %d", expectedIndex)
		}
	}

	audioTracks := make([]videorenderer.AudioTrack, 0, meta.AudioTracks)
	for expectedIndex := 0; expectedIndex < meta.AudioTracks; expectedIndex++ {
		header, err := readAudioHeader(reader)
		if err != nil {
			cleanup()
			return "", nil, nil, err
		}
		if err := validateAudioHeader(header, expectedIndex, meta.DurationSeconds); err != nil {
			cleanup()
			return "", nil, nil, err
		}
		audioPath := filepath.Join(workDir, fmt.Sprintf("audio-%03d.media", expectedIndex))
		file, err := os.Create(audioPath)
		if err != nil {
			cleanup()
			return "", nil, nil, fmt.Errorf("failed to create audio track %d", expectedIndex)
		}
		_, copyErr := io.CopyN(file, reader, header.ByteLength)
		closeErr := file.Close()
		if copyErr != nil || closeErr != nil {
			cleanup()
			return "", nil, nil, fmt.Errorf("audio track %d is incomplete", expectedIndex)
		}
		if err := consumeFrameDelimiter(reader); err != nil {
			cleanup()
			return "", nil, nil, fmt.Errorf("audio track %d delimiter missing", expectedIndex)
		}
		audioTracks = append(audioTracks, videorenderer.AudioTrack{
			Path: audioPath, StartSeconds: header.StartSeconds, EndSeconds: header.EndSeconds,
			TrimSeconds: header.TrimSeconds, PlaybackRate: header.PlaybackRate, Volume: header.Volume,
		})
	}

	return workDir, audioTracks, cleanup, nil
}

func readAudioHeader(reader *bufio.Reader) (audioStreamHeader, error) {
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return audioStreamHeader{}, fmt.Errorf("missing audio header")
	}
	var header audioStreamHeader
	if err := json.Unmarshal(bytes.TrimSpace(line), &header); err != nil {
		return audioStreamHeader{}, fmt.Errorf("invalid audio header")
	}
	return header, nil
}

func validateAudioHeader(header audioStreamHeader, expectedIndex int, durationSeconds float64) error {
	finite := func(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
	if header.Type != "audio" || header.Index != expectedIndex {
		return fmt.Errorf("invalid audio track order at track %d", expectedIndex)
	}
	if !finite(header.StartSeconds) || !finite(header.EndSeconds) || !finite(header.TrimSeconds) ||
		!finite(header.PlaybackRate) || !finite(header.Volume) {
		return fmt.Errorf("audio track %d has invalid values", expectedIndex)
	}
	if header.StartSeconds < 0 || header.EndSeconds <= header.StartSeconds || header.EndSeconds > durationSeconds+0.001 || header.TrimSeconds < 0 {
		return fmt.Errorf("audio track %d has invalid timing", expectedIndex)
	}
	if header.PlaybackRate < 0.25 || header.PlaybackRate > 4 || header.Volume < 0 || header.Volume > 4 {
		return fmt.Errorf("audio track %d has invalid playback settings", expectedIndex)
	}
	if header.ByteLength <= 0 || header.ByteLength > maxAudioTrackBytes {
		return fmt.Errorf("audio track %d has invalid byte length", expectedIndex)
	}
	return nil
}

func readFrameHeader(reader *bufio.Reader) (frameStreamHeader, error) {
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return frameStreamHeader{}, fmt.Errorf("missing frame header")
	}
	var header frameStreamHeader
	if err := json.Unmarshal(bytes.TrimSpace(line), &header); err != nil {
		return frameStreamHeader{}, fmt.Errorf("invalid frame header")
	}
	return header, nil
}

func consumeFrameDelimiter(reader *bufio.Reader) error {
	delimiter, err := reader.ReadByte()
	if err != nil {
		return err
	}
	if delimiter != '\n' {
		return fmt.Errorf("invalid frame delimiter")
	}
	return nil
}

func validatePNGFrame(frameBytes []byte, width, height, index int) error {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(frameBytes))
	if err != nil || format != "png" {
		return fmt.Errorf("frame %d is not a valid PNG", index)
	}
	if cfg.Width != width || cfg.Height != height {
		return fmt.Errorf("frame %d dimensions %dx%d do not match export %dx%d", index, cfg.Width, cfg.Height, width, height)
	}
	return nil
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
		"download_url": fmt.Sprintf("/clipmaker/export/%s/download", tmp.Token),
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
