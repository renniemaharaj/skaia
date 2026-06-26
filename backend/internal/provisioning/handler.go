package provisioning

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	log "github.com/skaia/backend/internal/syslog"
	"github.com/skaia/backend/internal/utils"
)

type Handler struct {
	svc Service
}

func NewHandler(svc Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Mount(r chi.Router, middlewares ...func(http.Handler) http.Handler) {
	r.Route("/provisioning", func(r chi.Router) {
		r.Use(middlewares...)
		r.Get("/blueprints", h.GetBlueprints)
		r.Post("/instances", h.ProvisionInstance)
		r.Get("/instances", h.GetInstances)
		r.Delete("/instances/{id}", h.TearDownInstance)
		r.Post("/instances/{id}/start", h.StartInstance)
		r.Post("/instances/{id}/stop", h.StopInstance)
		r.Post("/instances/{id}/restart", h.RestartInstance)
		r.Post("/instances/{id}/apps", h.InstallApp)
		r.Delete("/instances/{id}/apps/{app}", h.UninstallApp)
		r.Get("/instances/{id}/logs", h.GetInstanceLogs)
		r.Get("/stats", h.GetStats)
	})
}

func (h *Handler) GetBlueprints(w http.ResponseWriter, r *http.Request) {
	blueprints, err := h.svc.GetBlueprints()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to get blueprints")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(blueprints)
}

func (h *Handler) ProvisionInstance(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req ProvisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	instance, err := h.svc.ProvisionInstance(r.Context(), userID, req)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(instance)
}

func (h *Handler) GetInstances(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	instances, err := h.svc.GetClientInstances(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to get instances")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(instances)
}

func (h *Handler) StartInstance(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)
	if err := h.svc.StartInstance(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) StopInstance(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)
	if err := h.svc.StopInstance(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) RestartInstance(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)
	if err := h.svc.RestartInstance(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) InstallApp(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)

	var req struct {
		App string `json:"app"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if err := h.svc.InstallApp(id, req.App); err != nil {
		log.Printf("[ERROR] InstallApp(instance=%d app=%s): %v", id, req.App, err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) UninstallApp(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)
	app := chi.URLParam(r, "app")

	if err := h.svc.UninstallApp(id, app); err != nil {
		log.Printf("[ERROR] UninstallApp(instance=%d app=%s): %v", id, app, err)
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) GetInstanceLogs(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)
	logs, err := h.svc.GetInstanceLogs(id)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}

func (h *Handler) TearDownInstance(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)
	if err := h.svc.TearDownInstance(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetStats(r.Context())
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
