package upload

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
    "mime"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/skaia/backend/internal/utils"
)

type InitChunkedReq struct {
	Filename    string `json:"filename"`
	TotalChunks int    `json:"total_chunks"`
	TotalSize   int64  `json:"total_size"`
	UploadType  string `json:"upload_type"` // "image", "video", "file"
	Fingerprint string `json:"fingerprint"`
}

type InitChunkedRes struct {
	UploadID        string `json:"upload_id"`
	CompletedChunks []int  `json:"completed_chunks,omitempty"`
}

func (h *Handler) InitChunked(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req InitChunkedReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if req.TotalChunks <= 0 || req.TotalSize <= 0 {
		utils.WriteError(w, http.StatusBadRequest, "invalid chunks or size")
		return
	}

	if msg := CheckUserQuota(userID, req.TotalSize); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := CheckTotalQuota(req.TotalSize); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	uploadID := req.Fingerprint
	if uploadID == "" {
		uploadID = uuid.New().String()
	}

	tmpDir, err := userDir(userID, "tmp/"+uploadID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to create tmp dir")
		return
	}

	var completedChunks []int
	entries, err := os.ReadDir(tmpDir)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() || entry.Name() == "meta.json" || entry.Name() == "combined" || filepath.Ext(entry.Name()) == ".tmp" {
				continue
			}
			if idx, err := strconv.Atoi(entry.Name()); err == nil {
				completedChunks = append(completedChunks, idx)
			}
		}
	}

	// Save metadata
	metaPath := filepath.Join(tmpDir, "meta.json")
	metaFile, err := os.Create(metaPath)
	if err == nil {
		json.NewEncoder(metaFile).Encode(req)
		metaFile.Close()
	}

	utils.WriteJSON(w, http.StatusOK, InitChunkedRes{UploadID: uploadID, CompletedChunks: completedChunks})
}

func (h *Handler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	uploadID := chi.URLParam(r, "uploadID")
	if uploadID == "" {
		utils.WriteError(w, http.StatusBadRequest, "missing uploadID")
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}

	chunkIndexStr := r.FormValue("chunk_index")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid chunk index")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	tmpDir, _ := userDir(userID, "tmp/"+uploadID)
	chunkPath := filepath.Join(tmpDir, fmt.Sprintf("%d", chunkIndex))
	tmpChunkPath := chunkPath + ".tmp"

	out, err := os.Create(tmpChunkPath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to save chunk")
		return
	}

	_, err = io.Copy(out, file)
	out.Close()
	
	if err != nil {
		os.Remove(tmpChunkPath)
		utils.WriteError(w, http.StatusInternalServerError, "failed to write chunk")
		return
	}

	os.Rename(tmpChunkPath, chunkPath)

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) CompleteChunked(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	uploadID := chi.URLParam(r, "uploadID")
	if uploadID == "" {
		utils.WriteError(w, http.StatusBadRequest, "missing uploadID")
		return
	}

	tmpDir, _ := userDir(userID, "tmp/"+uploadID)
	metaPath := filepath.Join(tmpDir, "meta.json")
	metaBytes, err := os.ReadFile(metaPath)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "upload not found")
		return
	}

	var req InitChunkedReq
	json.Unmarshal(metaBytes, &req)

	// Combine chunks
	combinedPath := filepath.Join(tmpDir, "combined")
	out, err := os.Create(combinedPath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to combine")
		return
	}

	var actualSize int64
	for i := 0; i < req.TotalChunks; i++ {
		chunkPath := filepath.Join(tmpDir, fmt.Sprintf("%d", i))
		chunkFile, err := os.Open(chunkPath)
		if err != nil {
			out.Close()
			utils.WriteError(w, http.StatusBadRequest, "missing chunk")
			return
		}
		copied, _ := io.Copy(out, chunkFile)
		actualSize += copied
		chunkFile.Close()
		os.Remove(chunkPath)
	}
	out.Close()

    defer os.RemoveAll(tmpDir)

	if msg := CheckUserQuota(userID, 0); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	file, err := os.Open(combinedPath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to open combined file")
		return
	}
	defer file.Close()

    // Determine type and dir
	dirSub := "files"
	if req.UploadType == "image" {
		dirSub = "images"
	} else if req.UploadType == "video" {
		dirSub = "videos"
	}
	dir, err := userDir(userID, dirSub)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to create dir")
		return
	}

    // Read first 512 bytes for type detection
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	file.Seek(0, 0)
	ct := http.DetectContentType(buf[:n])
    if ct == "application/octet-stream" {
        ct = mime.TypeByExtension(filepath.Ext(req.Filename))
        if ct == "" {
            ct = "application/octet-stream"
        }
    }

	if req.UploadType == "image" && !typeAllowed(ct, AllowedImageTypes) {
		utils.WriteError(w, http.StatusBadRequest, "invalid image format")
		return
	}
	if req.UploadType == "video" && !typeAllowed(ct, AllowedVideoTypes) {
		utils.WriteError(w, http.StatusBadRequest, "invalid video format")
		return
	}

	ext := sanitizeExt(req.Filename)
    var finalName string
    if dirSub == "files" {
        safe := sanitizeName(req.Filename)
        finalName = fmt.Sprintf("%d_%s", time.Now().UnixNano(), safe)
    } else {
	    finalName = fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
    }

	url, size, err := saveFile(file, dir, finalName, userID, dirSub)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to save final file")
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UploadResponse{URL: url, Filename: finalName, Size: size, Type: ct})
	h.hub.PropagateUser(userID, map[string]interface{}{"action": "uploads_changed"})
}
