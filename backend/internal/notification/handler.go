package notification

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/models"
)

// Handler exposes notification HTTP endpoints.
type Handler struct {
	svc *Service
}

// NewHandler creates a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Mount registers notification routes on r.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/notifications", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/", h.list)
		r.Get("/unread-count", h.unreadCount)
		r.Put("/read-all", h.markAllRead)
		r.Delete("/", h.deleteAll)
		r.Put("/{id}/read", h.markRead)
		r.Delete("/{id}", h.delete)
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit := 50
	offset := 0
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
	list, err := h.svc.List(claims.UserID, limit, offset)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if list == nil {
		list = []*models.Notification{}
	}
	WriteJSON(w, http.StatusOK, list)
}

func (h *Handler) unreadCount(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	count, err := h.svc.UnreadCount(claims.UserID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]int{"count": count})
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.MarkRead(id, claims.UserID); err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) markAllRead(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := h.svc.MarkAllRead(claims.UserID); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.Delete(id, claims.UserID); err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deleteAll(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := h.svc.DeleteAll(claims.UserID); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
