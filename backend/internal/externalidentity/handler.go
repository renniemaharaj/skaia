package externalidentity

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/external-identities", func(r chi.Router) {
		r.Get("/providers", h.providers)
		r.Get("/public/users/{userID}", h.publicLinks)
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/providers", h.createProvider)
			r.Get("/links", h.ownLinks)
			r.Post("/challenges", h.start)
			r.Post("/challenges/complete", h.complete)
			r.Patch("/links/{linkID}/visibility", h.visibility)
			r.Delete("/links/{linkID}", h.unlink)
		})
	})
}

func decode(w http.ResponseWriter, r *http.Request, value any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	decoder.DisallowUnknownFields()
	return decoder.Decode(value)
}
func actor(r *http.Request) (int64, bool) { return utils.UserIDFromCtx(r) }
func sessionBinding(r *http.Request) []byte {
	hash := sha256.Sum256([]byte(r.Header.Get("Authorization")))
	return hash[:]
}

func (h *Handler) providers(w http.ResponseWriter, r *http.Request) {
	providers, err := h.service.ListProviders(r.Context())
	if err != nil {
		utils.WriteError(w, 500, "providers unavailable")
		return
	}
	utils.WriteJSON(w, 200, providers)
}
func (h *Handler) publicLinks(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil || userID <= 0 {
		utils.WriteError(w, 400, "invalid user")
		return
	}
	links, err := h.service.ListPublic(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, 500, "identities unavailable")
		return
	}
	utils.WriteJSON(w, 200, links)
}
func (h *Handler) createProvider(w http.ResponseWriter, r *http.Request) {
	actorID, ok := actor(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	var request CreateProviderRequest
	if decode(w, r, &request) != nil {
		utils.WriteError(w, 400, "invalid provider")
		return
	}
	provider, err := h.service.CreateProvider(r.Context(), actorID, request)
	h.write(w, provider, err, 201)
}
func (h *Handler) ownLinks(w http.ResponseWriter, r *http.Request) {
	actorID, ok := actor(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	links, err := h.service.ListOwn(r.Context(), actorID)
	if err != nil {
		utils.WriteError(w, 500, "identities unavailable")
		return
	}
	utils.WriteJSON(w, 200, links)
}
func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	actorID, ok := actor(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	var request struct {
		ProviderKey string `json:"provider_key"`
		Subject     string `json:"subject"`
		DisplayName string `json:"display_name"`
	}
	if decode(w, r, &request) != nil {
		utils.WriteError(w, 400, "invalid challenge")
		return
	}
	response, err := h.service.Start(r.Context(), actorID, sessionBinding(r), request.ProviderKey, request.Subject, request.DisplayName)
	h.write(w, response, err, 201)
}
func (h *Handler) complete(w http.ResponseWriter, r *http.Request) {
	actorID, ok := actor(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	var request struct {
		Token string `json:"token"`
		Proof string `json:"proof"`
	}
	if decode(w, r, &request) != nil {
		utils.WriteError(w, 400, "invalid challenge")
		return
	}
	link, err := h.service.Complete(r.Context(), actorID, sessionBinding(r), request.Token, request.Proof)
	h.write(w, link, err, 200)
}
func (h *Handler) visibility(w http.ResponseWriter, r *http.Request) {
	actorID, ok := actor(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	linkID, err := strconv.ParseInt(chi.URLParam(r, "linkID"), 10, 64)
	if err != nil {
		utils.WriteError(w, 400, "invalid link")
		return
	}
	var request struct {
		Public bool `json:"public"`
	}
	if decode(w, r, &request) != nil {
		utils.WriteError(w, 400, "invalid visibility")
		return
	}
	link, err := h.service.SetVisibility(r.Context(), actorID, linkID, request.Public)
	h.write(w, link, err, 200)
}
func (h *Handler) unlink(w http.ResponseWriter, r *http.Request) {
	actorID, ok := actor(r)
	if !ok {
		utils.WriteError(w, 401, "unauthorized")
		return
	}
	linkID, err := strconv.ParseInt(chi.URLParam(r, "linkID"), 10, 64)
	if err != nil {
		utils.WriteError(w, 400, "invalid link")
		return
	}
	if err := h.service.Unlink(r.Context(), actorID, linkID); err != nil {
		h.write(w, nil, err, 0)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (h *Handler) write(w http.ResponseWriter, value any, err error, success int) {
	switch {
	case errors.Is(err, ErrDenied):
		utils.WriteError(w, 403, "forbidden")
	case errors.Is(err, ErrValidation), errors.Is(err, ErrChallengeInvalid):
		utils.WriteError(w, 400, "verification could not be completed")
	case errors.Is(err, ErrAdapterDisabled):
		utils.WriteError(w, 503, "provider temporarily unavailable")
	case err != nil:
		utils.WriteError(w, 500, "identity operation failed")
	default:
		utils.WriteJSON(w, success, value)
	}
}
