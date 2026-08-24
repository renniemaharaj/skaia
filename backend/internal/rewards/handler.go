package rewards

import (
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
	"io"
	"net/http"
	"strconv"
)

type Handler struct{ s *Service }

func NewHandler(s *Service) *Handler { return &Handler{s: s} }
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/rewards", func(r chi.Router) {
		r.Post("/events/{provider}", h.ingest)
		r.Get("/catalog", h.catalog)
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Get("/account", h.account)
			r.Post("/redeem/{rewardID}", h.redeem)
			r.Post("/providers", h.provider)
			r.Post("/rules", h.rule)
			r.Post("/catalog", h.createReward)
			r.Post("/redemptions/{id}/retry", h.retry)
		})
	})
}
func body(w http.ResponseWriter, r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	d.DisallowUnknownFields()
	return d.Decode(v)
}
func user(r *http.Request) (int64, bool) { return utils.UserIDFromCtx(r) }
func (h *Handler) ingest(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		utils.WriteError(w, 400, "invalid event")
		return
	}
	v, replay, err := h.s.Ingest(r.Context(), chi.URLParam(r, "provider"), r.Header.Get("X-Reward-Timestamp"), r.Header.Get("X-Reward-Signature"), raw)
	if replay {
		w.Header().Set("X-Idempotent-Replay", "true")
	}
	h.write(w, v, err, 202)
}
func (h *Handler) catalog(w http.ResponseWriter, r *http.Request) {
	v, err := h.s.Catalog(r.Context())
	h.write(w, v, err, 200)
}
func (h *Handler) account(w http.ResponseWriter, r *http.Request) {
	id, ok := user(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	v, err := h.s.Account(r.Context(), id)
	h.write(w, v, err, 200)
}
func (h *Handler) redeem(w http.ResponseWriter, r *http.Request) {
	id, ok := user(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	rewardID, err := strconv.ParseInt(chi.URLParam(r, "rewardID"), 10, 64)
	if err != nil {
		utils.WriteError(w, 400, "invalid reward")
		return
	}
	v, replay, err := h.s.Redeem(r.Context(), id, rewardID, r.Header.Get("Idempotency-Key"))
	if replay {
		w.Header().Set("X-Idempotent-Replay", "true")
	}
	if err == nil {
		_ = h.s.Process(r.Context(), "http-redemption-"+strconv.FormatInt(v.ID, 10))
	}
	h.write(w, v, err, 201)
}
func (h *Handler) provider(w http.ResponseWriter, r *http.Request) {
	id, ok := user(r)
	if !ok {
		return
	}
	var v CreateProviderRequest
	if body(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid provider")
		return
	}
	out, err := h.s.CreateProvider(r.Context(), id, v)
	h.write(w, out, err, 201)
}
func (h *Handler) rule(w http.ResponseWriter, r *http.Request) {
	id, ok := user(r)
	if !ok {
		return
	}
	var v CreateRuleRequest
	if body(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid rule")
		return
	}
	out, err := h.s.CreateRule(r.Context(), id, v)
	h.write(w, out, err, 201)
}
func (h *Handler) createReward(w http.ResponseWriter, r *http.Request) {
	id, ok := user(r)
	if !ok {
		return
	}
	var v CreateRewardRequest
	if body(w, r, &v) != nil {
		utils.WriteError(w, 400, "invalid reward")
		return
	}
	out, err := h.s.CreateReward(r.Context(), id, v)
	h.write(w, out, err, 201)
}
func (h *Handler) retry(w http.ResponseWriter, r *http.Request) {
	id, ok := user(r)
	if !ok {
		return
	}
	rid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err == nil {
		err = h.s.Retry(r.Context(), id, rid)
	}
	h.write(w, map[string]string{"status": "pending"}, err, 200)
}
func (h *Handler) write(w http.ResponseWriter, v any, err error, status int) {
	switch {
	case errors.Is(err, ErrDenied):
		utils.WriteError(w, 403, "forbidden")
	case errors.Is(err, ErrValidation):
		utils.WriteError(w, 400, "invalid reward operation")
	case errors.Is(err, ErrConflict):
		utils.WriteError(w, 409, "idempotency conflict")
	case errors.Is(err, ErrInsufficient):
		utils.WriteError(w, 409, "insufficient points")
	case err != nil:
		utils.WriteError(w, 500, "reward operation failed")
	default:
		utils.WriteJSON(w, status, v)
	}
}
