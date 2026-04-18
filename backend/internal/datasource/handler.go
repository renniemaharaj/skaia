package datasource

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/events"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// DataSourceResponse wraps a DataSource with optional creator info.
type DataSourceResponse struct {
	*models.DataSource
	Creator *CreatorInfo `json:"creator,omitempty"`
}

// CreatorInfo is the subset of user fields returned with a datasource.
type CreatorInfo struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

// Handler serves data-source endpoints.
type Handler struct {
	svc               *Service
	userSvc           *iuser.Service
	compileCache      *CompileCache
	compileDispatcher *CompileDispatcher
}

// NewHandler creates a datasource Handler.
func NewHandler(svc *Service, userSvc *iuser.Service, compileCache *CompileCache, compileDispatcher *CompileDispatcher) *Handler {
	return &Handler{svc: svc, userSvc: userSvc, compileCache: compileCache, compileDispatcher: compileDispatcher}
}

// enrich attaches creator info to a datasource.
func (h *Handler) enrich(ds *models.DataSource) DataSourceResponse {
	resp := DataSourceResponse{DataSource: ds}
	if ds.CreatedBy != nil {
		u, err := h.userSvc.GetByID(*ds.CreatedBy)
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

// Mount registers data-source routes under /config/datasources.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler, optionalJWT func(http.Handler) http.Handler, compileIPLimit func(http.Handler) http.Handler, compileClientLimit func(http.Handler) http.Handler) {
	r.Route("/config/datasources", func(r chi.Router) {
		// Public reads
		r.Get("/", h.listDataSources)
		r.Get("/{id}", h.getDataSource)

		// Guests may request compiled output for a datasource by id.
		r.With(optionalJWT, compileIPLimit, compileClientLimit).Get("/{id}/compile", h.compileDataSourceByID)

		// Protected writes and raw compile.
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/compile", h.compileTypeScript)
			r.Post("/", h.createDataSource)
			r.Put("/{id}", h.updateDataSource)
			r.Delete("/{id}", h.deleteDataSource)
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

func (h *Handler) listDataSources(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List()
	if err != nil {
		log.Printf("datasource.list: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to list data sources")
		return
	}
	resp := make([]DataSourceResponse, 0, len(list))
	for _, ds := range list {
		resp = append(resp, h.enrich(ds))
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) getDataSource(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ds, err := h.svc.GetByID(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "data source not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, h.enrich(ds))
}

func (h *Handler) createDataSource(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var ds models.DataSource
	if err := json.NewDecoder(r.Body).Decode(&ds); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if ds.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	uid, _ := utils.UserIDFromCtx(r)
	if uid != 0 {
		ds.CreatedBy = &uid
	}
	if err := h.svc.Create(&ds); err != nil {
		log.Printf("datasource.create: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "create failed")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, h.enrich(&ds))
}

func (h *Handler) updateDataSource(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var ds models.DataSource
	if err := json.NewDecoder(r.Body).Decode(&ds); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	ds.ID = id
	if err := h.svc.Update(&ds); err != nil {
		log.Printf("datasource.update: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "update failed")
		return
	}
	updated, _ := h.svc.GetByID(id)
	if updated != nil {
		utils.WriteJSON(w, http.StatusOK, h.enrich(updated))
	} else {
		utils.WriteJSON(w, http.StatusOK, h.enrich(&ds))
	}
}

func (h *Handler) deleteDataSource(w http.ResponseWriter, r *http.Request) {
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
		log.Printf("datasource.delete: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) compileTypeScript(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Code == "" {
		utils.WriteError(w, http.StatusBadRequest, "code is required")
		return
	}

	result, err := CompileTypeScript(body.Code)
	if err != nil {
		log.Printf("datasource.compile: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	result.Cached = false
	utils.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) compileDataSourceByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid datasource id")
		return
	}

	ds, err := h.svc.GetByID(id)
	if err != nil {
		log.Printf("datasource.compile: lookup failed: %v", err)
		utils.WriteError(w, http.StatusNotFound, "datasource not found")
		return
	}
	if ds.Code == "" {
		utils.WriteError(w, http.StatusBadRequest, "datasource has no code")
		return
	}

	if h.compileCache != nil {
		if cached, ok := h.compileCache.Get(ds.Code); ok {
			utils.WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	job := CompileJob{
		DataSourceID: id,
		Source:       ds.Code,
		IP:           events.ClientIP(r),
		ResultCh:     make(chan compileResult, 1),
	}
	if uid, ok := utils.UserIDFromCtx(r); ok {
		job.UserID = uid
	}

	if h.compileDispatcher == nil || !h.compileDispatcher.Dispatch(job) {
		utils.WriteError(w, http.StatusServiceUnavailable, "compiler queue is busy")
		return
	}

	select {
	case res := <-job.ResultCh:
		if res.Err != nil {
			log.Printf("datasource.compile: %v", res.Err)
			utils.WriteError(w, http.StatusInternalServerError, res.Err.Error())
			return
		}
		utils.WriteJSON(w, http.StatusOK, res.Result)
	case <-time.After(15 * time.Second):
		utils.WriteError(w, http.StatusGatewayTimeout, "compiler timed out")
	}
}
