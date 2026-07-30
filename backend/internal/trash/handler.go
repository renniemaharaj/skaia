package trash

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

type Handler struct {
	svc      *Service
	notifier RestoreNotifier
}

type RestoreNotifier interface {
	BroadcastTrash(resource, id string)
}

func NewHandler(svc *Service, notifier ...RestoreNotifier) *Handler {
	handler := &Handler{svc: svc}
	if len(notifier) > 0 {
		handler.notifier = notifier[0]
	}
	return handler
}

func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/trash", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/", h.list)
		r.Get("/{resource}", h.listResource)
		r.Post("/{resource}/{id}/restore", h.restore)
	})
}

func queryInt(r *http.Request, key string, fallback int) int {
	value := r.URL.Query().Get(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	groups, err := h.svc.List(
		r.Context(),
		actorID,
		queryInt(r, "limit", DefaultLimit),
		queryInt(r, "offset", 0),
	)
	if err != nil {
		log.Printf("trash.list actor=%d: %v", actorID, err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to list trash")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"groups": groups})
}

func (h *Handler) listResource(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	group, err := h.svc.ListResource(
		r.Context(),
		actorID,
		chi.URLParam(r, "resource"),
		queryInt(r, "limit", DefaultLimit),
		queryInt(r, "offset", 0),
	)
	if errors.Is(err, ErrNotFound) {
		utils.WriteError(w, http.StatusNotFound, "resource not found")
		return
	}
	if err != nil {
		log.Printf("trash.listResource actor=%d resource=%q: %v", actorID, chi.URLParam(r, "resource"), err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to list trash")
		return
	}
	utils.WriteJSON(w, http.StatusOK, group)
}

func (h *Handler) restore(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	err := h.svc.Restore(
		r.Context(),
		actorID,
		chi.URLParam(r, "resource"),
		chi.URLParam(r, "id"),
	)
	switch {
	case errors.Is(err, ErrNotFound):
		utils.WriteError(w, http.StatusNotFound, "resource not found")
	case errors.Is(err, ErrForbidden):
		utils.WriteError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, ErrConflict):
		utils.WriteJSON(w, http.StatusConflict, map[string]string{
			"error": "restore conflict",
			"code":  "restore_conflict",
		})
	case err != nil:
		log.Printf(
			"trash.restore actor=%d resource=%q id=%q: %v",
			actorID,
			chi.URLParam(r, "resource"),
			chi.URLParam(r, "id"),
			err,
		)
		utils.WriteError(w, http.StatusInternalServerError, "failed to restore resource")
	default:
		if h.notifier != nil {
			h.notifier.BroadcastTrash(chi.URLParam(r, "resource"), chi.URLParam(r, "id"))
		}
		utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "restored"})
	}
}
