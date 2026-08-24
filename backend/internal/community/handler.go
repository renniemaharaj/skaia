package community

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

type Handler struct{ s *Service }

func NewHandler(s *Service) *Handler { return &Handler{s: s} }
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/community", func(r chi.Router) {
		r.Get("/{kind}", h.list)
		r.Get("/{kind}/{id}", h.get)
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/{kind}", h.create)
			r.Put("/{kind}/{id}", h.update)
			r.Post("/proposals/{id}/transition", h.transition)
			r.Put("/proposals/{id}/vote", h.vote)
			r.Put("/events/{id}/attendance", h.attend)
			r.Delete("/{kind}/{id}", h.delete)
		})
	})
}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	user, ok := actor(r)
	if !ok {
		return
	}
	id, err := publicationID(w, r)
	if err != nil {
		return
	}
	var v UpdateRequest
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid publication")
		return
	}
	out, err := h.s.Update(r.Context(), user, id, chi.URLParam(r, "kind"), v)
	h.write(w, out, err, 200)
}
func publicationID(w http.ResponseWriter, r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		utils.WriteError(w, 400, "invalid publication id")
		return 0, ErrValidation
	}
	return id, nil
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
	d.DisallowUnknownFields()
	return d.Decode(v)
}
func actor(r *http.Request) (int64, bool) { return utils.UserIDFromCtx(r) }
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	id, _ := actor(r)
	cursor, _ := strconv.ParseInt(r.URL.Query().Get("cursor"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	v, err := h.s.List(r.Context(), id, chi.URLParam(r, "kind"), cursor, limit, r.URL.Query().Get("q"))
	h.write(w, v, err, 200)
}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	user, _ := actor(r)
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	v, err := h.s.Get(r.Context(), user, chi.URLParam(r, "kind"), id)
	h.write(w, v, err, 200)
}
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	user, ok := actor(r)
	if !ok {
		return
	}
	var v CreateRequest
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid publication")
		return
	}
	v.Kind = chi.URLParam(r, "kind")
	out, err := h.s.Create(r.Context(), user, v)
	h.write(w, out, err, 201)
}
func (h *Handler) transition(w http.ResponseWriter, r *http.Request) {
	user, ok := actor(r)
	if !ok {
		return
	}
	id, err := publicationID(w, r)
	if err != nil {
		return
	}
	var v struct {
		State    string `json:"state"`
		Decision string `json:"decision"`
	}
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid proposal transition")
		return
	}
	out, err := h.s.Transition(r.Context(), user, id, v.State, v.Decision)
	h.write(w, out, err, 200)
}
func (h *Handler) vote(w http.ResponseWriter, r *http.Request) {
	user, ok := actor(r)
	if !ok {
		return
	}
	id, err := publicationID(w, r)
	if err != nil {
		return
	}
	var v struct {
		Value int `json:"value"`
	}
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid proposal vote")
		return
	}
	out, err := h.s.Vote(r.Context(), user, id, v.Value)
	h.write(w, out, err, 200)
}
func (h *Handler) attend(w http.ResponseWriter, r *http.Request) {
	user, ok := actor(r)
	if !ok {
		return
	}
	id, err := publicationID(w, r)
	if err != nil {
		return
	}
	var v struct {
		Status string `json:"status"`
	}
	if decode(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid event attendance")
		return
	}
	out, err := h.s.Attend(r.Context(), user, id, v.Status)
	h.write(w, out, err, 200)
}
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	user, ok := actor(r)
	if !ok {
		return
	}
	id, err := publicationID(w, r)
	if err != nil {
		return
	}
	err = h.s.Delete(r.Context(), user, id, chi.URLParam(r, "kind"))
	if err == nil {
		w.WriteHeader(204)
		return
	}
	h.write(w, nil, err, 0)
}
func (h *Handler) write(w http.ResponseWriter, v any, err error, status int) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		utils.WriteError(w, 404, "community content not found")
	case errors.Is(err, ErrDenied):
		utils.WriteError(w, 403, "forbidden")
	case errors.Is(err, ErrValidation):
		utils.WriteError(w, 400, "invalid community operation")
	case errors.Is(err, ErrTransition), errors.Is(err, ErrCapacity), errors.Is(err, ErrConflict):
		utils.WriteError(w, 409, "community operation rejected")
	case err != nil:
		utils.WriteError(w, 500, "community content unavailable")
	default:
		utils.WriteJSON(w, status, v)
	}
}
