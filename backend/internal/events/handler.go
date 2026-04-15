package events

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Handler exposes admin-only HTTP endpoints for querying the event log.
type Handler struct {
	repo  *Repository
	authz utils.Authorizer
}

// NewHandler creates an events Handler.
func NewHandler(repo *Repository, authz utils.Authorizer) *Handler {
	return &Handler{repo: repo, authz: authz}
}

// Mount registers event log routes on r.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/events", func(r chi.Router) {
		r.Use(jwt)
		r.Get("/", h.list)
	})
}

// list handles GET /api/events?limit=&offset=&user_id=&activity=&resource=
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "events.view") {
		return
	}

	q := r.URL.Query()
	limit, offset := 50, 0
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	var filterUserID *int64
	if v := q.Get("user_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			filterUserID = &id
		}
	}

	events, err := h.repo.List(limit, offset, filterUserID, q.Get("activity"), q.Get("resource"))
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to fetch events")
		return
	}
	if events == nil {
		events = []*models.Event{}
	}

	total, _ := h.repo.Count(filterUserID, q.Get("activity"), q.Get("resource"))

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"events":   events,
		"total":    total,
		"has_more": offset+len(events) < total,
	})
}
