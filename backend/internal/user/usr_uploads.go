package user

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	iupload "github.com/skaia/backend/internal/upload"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
)

// FileUploadResponse is returned after a successful upload.
type FileUploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

func (h *Handler) uploadProfilePhoto(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if msg := iupload.CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := iupload.CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "photo field required")
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck

	photoDir, err := userContentDir(userID, "photos")
	if err != nil {
		log.Printf("user.Handler.uploadProfilePhoto: mkdir: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	filename := fmt.Sprintf("photo_%d%s", time.Now().UnixNano(), filepath.Ext(header.Filename))
	dst, err := os.Create(filepath.Join(photoDir, filename))
	if err != nil {
		log.Printf("user.Handler.uploadProfilePhoto: create file: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()

	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	u, err := h.svc.GetByID(userID)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	oldPhotoURL := u.PhotoURL
	u.PhotoURL = fmt.Sprintf("/uploads/users/%d/photos/%s", userID, filename)
	if _, err = h.svc.Update(u); err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	// Remove old photo file.
	go iupload.DeleteUploadFile(oldPhotoURL)

	if h.hub != nil {
		u.PasswordHash = ""
		go h.hub.PropagateUser(userID, map[string]interface{}{"user": u})
		payload, _ := json.Marshal(map[string]interface{}{
			"action": "user_updated",
			"data":   map[string]interface{}{"user": u},
		})
		go h.hub.SendToUser(userID, &ws.Message{Type: ws.UserUpdate, Payload: payload})
	}
	utils.WriteJSON(w, http.StatusCreated, FileUploadResponse{
		URL:      u.PhotoURL,
		Filename: filename,
		Size:     size,
		Type:     header.Header.Get("Content-Type"),
	})
}

func (h *Handler) uploadProfileBanner(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	h.saveAndStoreBanner(w, r, userID)
}

func (h *Handler) uploadUserPhoto(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	// Only allow if acting on own profile or has user.manage-others permission
	canManage, _ := h.svc.HasPermission(userID, "user.manage-others")
	if userID != targetID && !canManage {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	if msg := iupload.CheckUserQuota(targetID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := iupload.CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("photo")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "photo field required")
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck

	photoDir, err := userContentDir(targetID, "photos")
	if err != nil {
		log.Printf("user.Handler.uploadUserPhoto: mkdir: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	filename := fmt.Sprintf("photo_%d%s", time.Now().UnixNano(), filepath.Ext(header.Filename))
	dst, err := os.Create(filepath.Join(photoDir, filename))
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()
	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	u, err := h.svc.GetByID(targetID)
	if err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	oldPhotoURL := u.PhotoURL
	u.PhotoURL = fmt.Sprintf("/uploads/users/%d/photos/%s", targetID, filename)
	if _, err = h.svc.Update(u); err != nil {
		os.Remove(filepath.Join(photoDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	// Remove old photo file.
	go iupload.DeleteUploadFile(oldPhotoURL)

	if h.hub != nil {
		u.PasswordHash = ""
		go h.hub.PropagateUser(targetID, map[string]interface{}{"user": u})
		payload, _ := json.Marshal(map[string]interface{}{
			"action": "user_updated",
			"data":   map[string]interface{}{"user": u},
		})
		go h.hub.SendToUser(targetID, &ws.Message{Type: ws.UserUpdate, Payload: payload})
	}
	utils.WriteJSON(w, http.StatusCreated, FileUploadResponse{URL: u.PhotoURL, Filename: filename, Size: size, Type: header.Header.Get("Content-Type")})
}

func (h *Handler) uploadUserBanner(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	canManage, _ := h.svc.HasPermission(userID, "user.manage-others")
	if userID != targetID && !canManage {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	h.saveAndStoreBanner(w, r, targetID)
}

func (h *Handler) saveAndStoreBanner(w http.ResponseWriter, r *http.Request, userID int64) {
	if msg := iupload.CheckUserQuota(userID); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}
	if msg := iupload.CheckTotalQuota(); msg != "" {
		utils.WriteError(w, http.StatusForbidden, msg)
		return
	}

	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "failed to parse form")
		return
	}
	file, header, err := r.FormFile("banner")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "banner field required")
		return
	}
	defer file.Close()

	if err := validateImageFile(file, header.Header); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	file.Seek(0, 0) //nolint:errcheck

	bannerDir, err := userContentDir(userID, "banners")
	if err != nil {
		log.Printf("user.Handler.saveAndStoreBanner: mkdir: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	filename := fmt.Sprintf("banner_%d%s", time.Now().UnixNano(), filepath.Ext(header.Filename))
	dst, err := os.Create(filepath.Join(bannerDir, filename))
	if err != nil {
		log.Printf("user.Handler.saveAndStoreBanner: create file: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()
	size, err := io.Copy(dst, file)
	if err != nil {
		os.Remove(filepath.Join(bannerDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	u, err := h.svc.GetByID(userID)
	if err != nil {
		os.Remove(filepath.Join(bannerDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	oldBannerURL := u.BannerURL
	u.BannerURL = fmt.Sprintf("/uploads/users/%d/banners/%s", userID, filename)
	if _, err = h.svc.Update(u); err != nil {
		os.Remove(filepath.Join(bannerDir, filename)) //nolint:errcheck
		utils.WriteError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	// Remove old banner file.
	go iupload.DeleteUploadFile(oldBannerURL)
	if h.hub != nil {
		u.PasswordHash = ""
		go h.hub.PropagateUser(userID, map[string]interface{}{"user": u})
		payload, _ := json.Marshal(map[string]interface{}{
			"action": "user_updated",
			"data":   map[string]interface{}{"user": u},
		})
		go h.hub.SendToUser(userID, &ws.Message{Type: ws.UserUpdate, Payload: payload})
	}
	utils.WriteJSON(w, http.StatusCreated, FileUploadResponse{URL: u.BannerURL, Filename: filename, Size: size, Type: header.Header.Get("Content-Type")})
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
	for _, allowed := range []string{"image/jpeg", "image/png", "image/webp", "image/gif"} {
		if ct == allowed {
			return nil
		}
	}
	return errors.New("only JPEG, PNG, WEBP, and GIF images are allowed")
}

// Role CRUD handlers

func (h *Handler) createRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.svc, userID, "user.manage-others") {
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		PowerLevel  int    `json:"power_level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "role name required")
		return
	}

	// Actor cannot create a role with power level >= their own.
	actorLevel, err := h.svc.GetUserMaxPowerLevel(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "power level check failed")
		return
	}
	if req.PowerLevel >= actorLevel {
		utils.WriteError(w, http.StatusForbidden, "cannot create a role with power level equal to or exceeding your own")
		return
	}

	role, err := h.svc.CreateRole(req.Name, req.Description, req.PowerLevel)
	if err != nil {
		log.Printf("user.Handler.createRole: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create role")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, role)
}
