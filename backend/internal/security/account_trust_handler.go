package security

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

type AccountTrustHandler struct {
	policy *AccountTrustPolicy
}

func NewAccountTrustHandler(policy *AccountTrustPolicy) *AccountTrustHandler {
	return &AccountTrustHandler{policy: policy}
}

func (h *AccountTrustHandler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.With(jwt).Get("/auth/trust-status", h.status)
}

func (h *AccountTrustHandler) status(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	decision, err := h.policy.Evaluate(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, http.StatusServiceUnavailable, "account trust is temporarily unavailable")
		return
	}
	utils.WriteJSON(w, http.StatusOK, decision)
}
