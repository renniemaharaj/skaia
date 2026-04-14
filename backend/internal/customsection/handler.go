package customsection

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

// CreatorInfo is the subset of user fields returned with a custom section.
type CreatorInfo struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

// CustomSectionResponse wraps a CustomSection with optional creator info.
type CustomSectionResponse struct {
	*models.CustomSection
	Creator *CreatorInfo `json:"creator,omitempty"`
}

// Handler serves custom-section endpoints.
type Handler struct {
	svc     *Service
	userSvc *iuser.Service
}

// NewHandler creates a custom section Handler.
func NewHandler(svc *Service, userSvc *iuser.Service) *Handler {
	return &Handler{svc: svc, userSvc: userSvc}
}

func (h *Handler) enrich(cs *models.CustomSection) CustomSectionResponse {
	resp := CustomSectionResponse{CustomSection: cs}
	if cs.CreatedBy != nil {
		u, err := h.userSvc.GetByID(*cs.CreatedBy)
		if err == nil && u != nil {
			resp.Creator = &CreatorInfo{
				ID:          u.ID,
				Username:    u.Username,
				DisplayName: u.DisplayName,
				AvatarURL:   u.AvatarURL,
			}
		}
	}
	return resp
}

// Mount registers custom-section routes under /config/custom-sections.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/config/custom-sections", func(r chi.Router) {
		r.Get("/", h.list)
		r.Get("/{id}", h.get)

		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/", h.create)
			r.Put("/{id}", h.update)
			r.Delete("/{id}", h.delete)
		})
	})
}

func (h *Handler) requireHomeManage(r *http.Request) bool {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		return false
	}
	has, _ := h.userSvc.HasPermission(uid, "home.manage")
	return has
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	// Optional filter by datasource_id
	var list []*models.CustomSection
	var err error
	if dsID := r.URL.Query().Get("datasource_id"); dsID != "" {
		id, parseErr := strconv.ParseInt(dsID, 10, 64)
		if parseErr != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid datasource_id")
			return
		}
		list, err = h.svc.ListByDataSource(id)
	} else {
		list, err = h.svc.List()
	}
	if err != nil {
		log.Printf("customsection.list: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to list custom sections")
		return
	}
	resp := make([]CustomSectionResponse, 0, len(list))
	for _, cs := range list {
		resp = append(resp, h.enrich(cs))
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	cs, err := h.svc.GetByID(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "custom section not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, h.enrich(cs))
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var cs models.CustomSection
	if err := json.NewDecoder(r.Body).Decode(&cs); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if cs.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if cs.DataSourceID == 0 {
		utils.WriteError(w, http.StatusBadRequest, "datasource_id is required")
		return
	}
	if cs.SectionType == "" {
		cs.SectionType = "cards"
	}
	if cs.Config == "" {
		cs.Config = "{}"
	}
	uid, _ := utils.UserIDFromCtx(r)
	if uid != 0 {
		cs.CreatedBy = &uid
	}
	if err := h.svc.Create(&cs); err != nil {
		log.Printf("customsection.create: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "create failed")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, h.enrich(&cs))
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var cs models.CustomSection
	if err := json.NewDecoder(r.Body).Decode(&cs); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	cs.ID = id
	if err := h.svc.Update(&cs); err != nil {
		log.Printf("customsection.update: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "update failed")
		return
	}
	updated, _ := h.svc.GetByID(id)
	if updated != nil {
		utils.WriteJSON(w, http.StatusOK, h.enrich(updated))
	} else {
		utils.WriteJSON(w, http.StatusOK, h.enrich(&cs))
	}
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.Delete(id); err != nil {
		log.Printf("customsection.delete: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
