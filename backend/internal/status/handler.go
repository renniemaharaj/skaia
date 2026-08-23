package status

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/status", func(r chi.Router) {
		r.Get("/", h.public)
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Get("/diagnostics", h.diagnostics)
			r.Post("/incidents", h.create)
			r.Put("/incidents/{id}", h.update)
		})
	})
}

func PublicEnabled() bool {
	for _, feature := range strings.Split(os.Getenv("FEATURES_ENABLED"), ",") {
		if strings.EqualFold(strings.TrimSpace(feature), "status") {
			return true
		}
	}
	return false
}

func (h *Handler) public(w http.ResponseWriter, r *http.Request) {
	if !PublicEnabled() {
		utils.WriteError(w, http.StatusNotFound, "status page not enabled")
		return
	}
	snapshot, err := h.service.Public(r.Context())
	if err != nil {
		utils.WriteError(w, http.StatusServiceUnavailable, "status temporarily unavailable")
		return
	}
	utils.WriteJSON(w, http.StatusOK, snapshot)
}

func (h *Handler) diagnostics(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	diagnostics, err := h.service.Diagnostics(r.Context(), actorID)
	if err != nil {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	utils.WriteJSON(w, http.StatusOK, diagnostics)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	h.mutate(w, r, 0)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		utils.WriteError(w, http.StatusBadRequest, "invalid incident id")
		return
	}
	h.mutate(w, r, id)
}

func (h *Handler) mutate(w http.ResponseWriter, r *http.Request, incidentID int64) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var incident Incident
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&incident); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid incident")
		return
	}
	var result *Incident
	var err error
	if incidentID == 0 {
		result, err = h.service.Create(r.Context(), actorID, incident)
	} else {
		result, err = h.service.Update(r.Context(), actorID, incidentID, incident)
	}
	if errors.Is(err, ErrDenied) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	if errors.Is(err, ErrValidation) {
		utils.WriteError(w, http.StatusBadRequest, "invalid incident")
		return
	}
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "incident update failed")
		return
	}
	code := http.StatusOK
	if incidentID == 0 {
		code = http.StatusCreated
	}
	utils.WriteJSON(w, code, result)
}
