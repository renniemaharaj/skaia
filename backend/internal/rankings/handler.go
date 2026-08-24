package rankings

import (
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
	"net/http"
	"strconv"
)

type Handler struct{ s *Service }

func NewHandler(s *Service) *Handler { return &Handler{s: s} }
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/rankings", func(r chi.Router) {
		r.Get("/datasets", h.datasets)
		r.Get("/{dataset}/seasons", h.seasons)
		r.Get("/{dataset}/seasons/{season}", h.standings)
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/datasets", h.createDataset)
			r.Post("/{dataset}/seasons", h.createSeason)
			r.Post("/{dataset}/seasons/{season}/close", h.close)
			r.Post("/{dataset}/ingest", h.ingest)
		})
	})
}
func (h *Handler) seasons(w http.ResponseWriter, r *http.Request) {
	id, _ := actor(r)
	v, err := h.s.Seasons(r.Context(), id, chi.URLParam(r, "dataset"))
	h.write(w, v, err, 200)
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	d.DisallowUnknownFields()
	return d.Decode(v)
}
func actor(r *http.Request) (int64, bool) { return utils.UserIDFromCtx(r) }
func (h *Handler) datasets(w http.ResponseWriter, r *http.Request) {
	id, _ := actor(r)
	v, err := h.s.Datasets(r.Context(), id)
	h.write(w, v, err, 200)
}
func (h *Handler) standings(w http.ResponseWriter, r *http.Request) {
	id, _ := actor(r)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	v, err := h.s.Standings(r.Context(), id, chi.URLParam(r, "dataset"), chi.URLParam(r, "season"), r.URL.Query().Get("cursor"), limit)
	h.write(w, v, err, 200)
}
func (h *Handler) createDataset(w http.ResponseWriter, r *http.Request) {
	id, ok := actor(r)
	if !ok {
		return
	}
	var v CreateDatasetRequest
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid dataset")
		return
	}
	out, err := h.s.CreateDataset(r.Context(), id, v)
	h.write(w, out, err, 201)
}
func (h *Handler) createSeason(w http.ResponseWriter, r *http.Request) {
	id, ok := actor(r)
	if !ok {
		return
	}
	var v CreateSeasonRequest
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid season")
		return
	}
	out, err := h.s.CreateSeason(r.Context(), id, chi.URLParam(r, "dataset"), v)
	h.write(w, out, err, 201)
}
func (h *Handler) close(w http.ResponseWriter, r *http.Request) {
	id, ok := actor(r)
	if !ok {
		return
	}
	out, err := h.s.CloseSeason(r.Context(), id, chi.URLParam(r, "dataset"), chi.URLParam(r, "season"))
	h.write(w, out, err, 200)
}
func (h *Handler) ingest(w http.ResponseWriter, r *http.Request) {
	id, ok := actor(r)
	if !ok {
		return
	}
	var v IngestRequest
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid score")
		return
	}
	out, replay, err := h.s.Ingest(r.Context(), id, chi.URLParam(r, "dataset"), v)
	if replay {
		w.Header().Set("X-Idempotent-Replay", "true")
	}
	h.write(w, out, err, 202)
}
func (h *Handler) write(w http.ResponseWriter, v any, err error, status int) {
	switch {
	case errors.Is(err, ErrDenied):
		utils.WriteError(w, 403, "forbidden")
	case errors.Is(err, ErrValidation):
		utils.WriteError(w, 400, "invalid ranking operation")
	case errors.Is(err, ErrConflict), errors.Is(err, ErrClosed):
		utils.WriteError(w, 409, "ranking update rejected")
	case err != nil:
		utils.WriteError(w, 500, "rankings unavailable")
	default:
		utils.WriteJSON(w, status, v)
	}
}
