package analytics

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Handler exposes analytics HTTP endpoints.
type Handler struct {
	svc *Service
}

// NewHandler creates an analytics Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Mount registers analytics routes on r.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/analytics", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/views/{resource}/{resourceId}", h.getStats)
		r.Get("/visitors/{resource}/{resourceId}", h.getVisitors)
	})
}

// getStats handles GET /api/analytics/views/{resource}/{resourceId}?days=30
func (h *Handler) getStats(w http.ResponseWriter, r *http.Request) {
	_, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	resource := chi.URLParam(r, "resource")
	if resource != "page" && resource != "thread" {
		utils.WriteError(w, http.StatusBadRequest, "invalid resource type")
		return
	}

	resourceID, err := strconv.ParseInt(chi.URLParam(r, "resourceId"), 10, 64)
	if err != nil || resourceID < 1 {
		utils.WriteError(w, http.StatusBadRequest, "invalid resource ID")
		return
	}

	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			days = n
		}
	}

	stats, err := h.svc.Stats(resource, resourceID, days)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}

	totalViews, uniqueViewers, uniqueIPs, err := h.svc.Summary(resource, resourceID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to load summary")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"resource":       resource,
		"resource_id":    resourceID,
		"days":           days,
		"total_views":    totalViews,
		"unique_viewers": uniqueViewers,
		"unique_ips":     uniqueIPs,
		"daily":          stats,
	})
}

// getVisitors handles GET /api/analytics/visitors/{resource}/{resourceId}?limit=50&offset=0
func (h *Handler) getVisitors(w http.ResponseWriter, r *http.Request) {
	_, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	resource := chi.URLParam(r, "resource")
	if resource != "page" && resource != "thread" {
		utils.WriteError(w, http.StatusBadRequest, "invalid resource type")
		return
	}

	resourceID, err := strconv.ParseInt(chi.URLParam(r, "resourceId"), 10, 64)
	if err != nil || resourceID < 1 {
		utils.WriteError(w, http.StatusBadRequest, "invalid resource ID")
		return
	}

	limit, offset := 50, 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	identifiedOnly := r.URL.Query().Get("identified") == "true"

	visitors, err := h.svc.RecentVisitors(resource, resourceID, limit, offset, identifiedOnly)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to load visitors")
		return
	}
	if visitors == nil {
		visitors = []*models.VisitorEntry{}
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"visitors": visitors,
	})
}
