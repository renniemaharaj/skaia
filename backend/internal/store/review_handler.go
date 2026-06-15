package store

import (
	"encoding/json"
	"net/http"

	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

func (h *Handler) getProductReviews(w http.ResponseWriter, r *http.Request) {
	productID, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	reviews, err := h.svc.GetProductReviews(r.Context(), productID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to get reviews")
		return
	}

	utils.WriteJSON(w, http.StatusOK, reviews)
}

func (h *Handler) createProductReview(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	productID, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid product id")
		return
	}

	var req struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}

	if req.Rating < 1 || req.Rating > 5 {
		utils.WriteError(w, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}

	review := &models.ProductReview{
		ProductID: productID,
		UserID:    userID,
		Rating:    req.Rating,
		Comment:   req.Comment,
	}

	err = h.svc.reviews.CreateProductReview(r.Context(), review)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to create review")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
