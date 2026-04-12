package page

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Handler serves custom-page endpoints.
type Handler struct {
	svc     *Service
	userSvc *iuser.Service
}

// NewHandler creates a page Handler.
func NewHandler(svc *Service, userSvc *iuser.Service) *Handler {
	return &Handler{svc: svc, userSvc: userSvc}
}

// Mount registers page routes under /config/pages.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/config/pages", func(r chi.Router) {
		// Public reads
		r.Get("/index", h.getIndex)
		r.Get("/list", h.listPages)
		r.Get("/browse", h.browsePages)
		r.Get("/{slug}", h.getBySlug)

		// Protected writes
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/", h.createPage)
			r.Put("/{id}", h.updatePage)
			r.Delete("/{id}", h.deletePage)

			// Ownership & editor management
			r.Put("/{id}/owner", h.setOwner)
			r.Delete("/{id}/owner", h.clearOwner)
			r.Post("/{id}/editors", h.addEditor)
			r.Delete("/{id}/editors/{userId}", h.removeEditor)
		})
	})
}

// ── helpers ─────────────────────────────────────────────────────────────────

func (h *Handler) requireHomeManage(r *http.Request) bool {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		return false
	}
	has, _ := h.userSvc.HasPermission(uid, "home.manage")
	return has
}

func (h *Handler) isAdmin(r *http.Request) bool {
	return h.requireHomeManage(r)
}

func parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

// canEditPage returns true if the requesting user is admin, owner, or editor.
func (h *Handler) canEditPage(r *http.Request, pageID int64) bool {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		return false
	}
	return h.svc.CanEdit(pageID, uid, h.isAdmin(r))
}

// ── handlers ────────────────────────────────────────────────────────────────

func (h *Handler) getIndex(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.GetIndex()
	if err != nil {
		log.Printf("page.getIndex: %v", err)
		utils.WriteError(w, http.StatusNotFound, "no index page")
		return
	}
	h.svc.EnrichPage(p)
	utils.WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) getBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		utils.WriteError(w, http.StatusBadRequest, "missing slug")
		return
	}
	p, err := h.svc.GetBySlug(slug)
	if err != nil {
		log.Printf("page.getBySlug(%s): %v", slug, err)
		utils.WriteError(w, http.StatusNotFound, "page not found")
		return
	}
	h.svc.EnrichPage(p)
	utils.WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) listPages(w http.ResponseWriter, r *http.Request) {
	pages, err := h.svc.List()
	if err != nil {
		log.Printf("page.listPages: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to list pages")
		return
	}
	if pages == nil {
		pages = []*models.Page{}
	}
	utils.WriteJSON(w, http.StatusOK, pages)
}

func (h *Handler) createPage(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var p models.Page
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if p.Slug == "" {
		utils.WriteError(w, http.StatusBadRequest, "slug is required")
		return
	}
	if err := h.svc.Create(&p); err != nil {
		log.Printf("page.createPage: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "create failed")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) updatePage(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if !h.canEditPage(r, id) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var p models.Page
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	p.ID = id
	if err := h.svc.Update(&p); err != nil {
		log.Printf("page.updatePage: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "update failed")
		return
	}
	updated, _ := h.svc.GetByID(id)
	if updated != nil {
		h.svc.EnrichPage(updated)
		utils.WriteJSON(w, http.StatusOK, updated)
	} else {
		utils.WriteJSON(w, http.StatusOK, p)
	}
}

func (h *Handler) deletePage(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.Delete(id); err != nil {
		log.Printf("page.deletePage: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ── browse (public feed of custom pages) ────────────────────────────────────

func (h *Handler) browsePages(w http.ResponseWriter, r *http.Request) {
	pages, err := h.svc.ListWithOwnership()
	if err != nil {
		log.Printf("page.browsePages: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to list pages")
		return
	}
	if pages == nil {
		pages = []*models.Page{}
	}
	// Enrich each page with editors
	for _, p := range pages {
		if editors, err := h.svc.GetEditors(p.ID); err == nil {
			p.Editors = editors
		}
		if p.Editors == nil {
			p.Editors = []*models.PageUser{}
		}
	}
	utils.WriteJSON(w, http.StatusOK, pages)
}

// ── ownership & editor management ───────────────────────────────────────────

func (h *Handler) setOwner(w http.ResponseWriter, r *http.Request) {
	// Only admin can assign/transfer ownership
	if !h.requireHomeManage(r) {
		uid, ok := utils.UserIDFromCtx(r)
		if !ok {
			utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		// Owner can also transfer ownership
		id, err := parseID(r, "id")
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}
		page, err := h.svc.GetByID(id)
		if err != nil || page.OwnerID == nil || *page.OwnerID != uid {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		UserID int64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == 0 {
		utils.WriteError(w, http.StatusBadRequest, "user_id required")
		return
	}
	if err := h.svc.SetOwner(id, body.UserID); err != nil {
		log.Printf("page.setOwner: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to set owner")
		return
	}
	page, _ := h.svc.GetByID(id)
	if page != nil {
		h.svc.EnrichPage(page)
		utils.WriteJSON(w, http.StatusOK, page)
	} else {
		utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func (h *Handler) clearOwner(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.ClearOwner(id); err != nil {
		log.Printf("page.clearOwner: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to clear owner")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) addEditor(w http.ResponseWriter, r *http.Request) {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Admin or owner can add editors
	isAdm := h.isAdmin(r)
	if !isAdm {
		page, err := h.svc.GetByID(id)
		if err != nil || page.OwnerID == nil || *page.OwnerID != uid {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	var body struct {
		UserID int64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == 0 {
		utils.WriteError(w, http.StatusBadRequest, "user_id required")
		return
	}
	if err := h.svc.AddEditor(id, body.UserID, uid); err != nil {
		log.Printf("page.addEditor: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to add editor")
		return
	}
	editors, _ := h.svc.GetEditors(id)
	if editors == nil {
		editors = []*models.PageUser{}
	}
	utils.WriteJSON(w, http.StatusOK, editors)
}

func (h *Handler) removeEditor(w http.ResponseWriter, r *http.Request) {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	editorID, err := strconv.ParseInt(chi.URLParam(r, "userId"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid userId")
		return
	}

	// Admin or owner can remove editors
	isAdm := h.isAdmin(r)
	if !isAdm {
		page, err := h.svc.GetByID(id)
		if err != nil || page.OwnerID == nil || *page.OwnerID != uid {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	if err := h.svc.RemoveEditor(id, editorID); err != nil {
		log.Printf("page.removeEditor: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to remove editor")
		return
	}
	editors, _ := h.svc.GetEditors(id)
	if editors == nil {
		editors = []*models.PageUser{}
	}
	utils.WriteJSON(w, http.StatusOK, editors)
}
