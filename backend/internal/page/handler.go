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
		r.Get("/{slug}", h.getBySlug)

		// Protected writes — requires home.manage
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/", h.createPage)
			r.Put("/{id}", h.updatePage)
			r.Delete("/{id}", h.deletePage)
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

func parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

// ── handlers ────────────────────────────────────────────────────────────────

func (h *Handler) getIndex(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.GetIndex()
	if err != nil {
		log.Printf("page.getIndex: %v", err)
		utils.WriteError(w, http.StatusNotFound, "no index page")
		return
	}
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
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
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
	// Re-read to get the full row with updated_at
	updated, _ := h.svc.GetByID(id)
	if updated != nil {
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
