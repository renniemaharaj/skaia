package store

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// Handler exposes all store HTTP endpoints.
type Handler struct {
	svc        *Service
	hub        *ws.Hub
	authz      utils.Authorizer
	dispatcher *ievents.Dispatcher
}

// NewHandler creates a Handler.
func NewHandler(svc *Service, hub *ws.Hub, authz utils.Authorizer, dispatcher *ievents.Dispatcher) *Handler {
	return &Handler{svc: svc, hub: hub, authz: authz, dispatcher: dispatcher}
}

// Mount registers all store routes on r.
func (h *Handler) Mount(r chi.Router, jwt, optJWT func(http.Handler) http.Handler) {
	r.Route("/store", func(r chi.Router) {
		// Category routes
		r.With(optJWT).Get("/categories", h.listCategories)
		r.With(optJWT).Get("/categories/{id}", h.getCategory)
		r.With(jwt).Post("/categories", h.createCategory)
		r.With(jwt).Put("/categories/{id}", h.updateCategory)
		r.With(jwt).Delete("/categories/{id}", h.deleteCategory)

		// Category-scoped product listing
		r.With(optJWT).Get("/categories/{id}/products", h.listCategoryProducts)

		// Product routes
		r.With(optJWT).Get("/products", h.listProducts)
		r.With(optJWT).Get("/products/{id}", h.getProduct)
		r.With(jwt).Post("/products", h.createProduct)
		r.With(jwt).Put("/products/{id}", h.updateProduct)
		r.With(jwt).Delete("/products/{id}", h.deleteProduct)
		r.With(optJWT).Get("/products/{id}/reviews", h.getProductReviews)
		r.With(jwt).Post("/products/{id}/reviews", h.createProductReview)

		// Cart routes (all require auth)
		r.With(jwt).Get("/cart", h.getCart)
		r.With(jwt).Post("/cart/add", h.addToCart)
		r.With(jwt).Put("/cart/update", h.updateCartItem)
		r.With(jwt).Delete("/cart/remove", h.removeFromCart)
		r.With(jwt).Delete("/cart", h.clearCart)

		// Wallet routes
		r.With(jwt).Get("/wallet", h.getWallet)
		r.With(jwt).Post("/wallet/topup", h.topUpWallet)
		r.With(jwt).Get("/wallet/cards", h.getCards)
		r.With(jwt).Post("/wallet/cards", h.addCard)
		r.With(jwt).Put("/wallet/cards/{id}", h.updateCard)
		r.With(jwt).Delete("/wallet/cards/{id}", h.deleteCard)

		// Checkout - all payment logic is backend-only
		r.With(optJWT).Post("/checkout", h.checkout)

		// Reference code routes
		r.With(jwt).Get("/reference-codes", h.listReferenceCodes)
		r.With(jwt).Post("/reference-codes", h.createReferenceCode)
		r.With(jwt).Put("/reference-codes/{id}", h.updateReferenceCode)
		r.With(jwt).Delete("/reference-codes/{id}", h.deleteReferenceCode)

		// Order routes
		r.With(jwt).Post("/orders", h.createOrder)
		r.With(jwt).Get("/orders", h.listOrders)
		r.With(jwt).Get("/orders/{id}", h.getOrder)
		r.With(jwt).Put("/orders/{id}/status", h.updateOrderStatus)
		r.With(jwt).Delete("/orders/{id}", h.deleteOrder)

		r.Post("/orders/guest-lookup", h.guestLookupOrder)

		// Subscription plan routes
		r.With(optJWT).Get("/plans", h.listPlans)
		r.With(jwt).Post("/plans", h.createPlan)
		r.With(jwt).Put("/plans/{id}", h.updatePlan)
		r.With(jwt).Delete("/plans/{id}", h.deletePlan)

		// Subscription routes
		r.With(jwt).Post("/subscribe", h.subscribe)
		r.With(jwt).Get("/subscriptions", h.listSubscriptions)
		r.With(jwt).Get("/subscriptions/current", h.getCurrentSubscription)
		r.With(jwt).Post("/subscriptions/{id}/cancel", h.cancelSubscription)

		// Payment status
		r.With(jwt).Get("/payments/{ref}/status", h.getPaymentStatus)
		r.With(jwt).Get("/orders/{id}/payment", h.getOrderPayment)
	})
}

func (h *Handler) parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

// Category handlers

func (h *Handler) listCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.svc.ListCategories()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, cats)
}

func (h *Handler) getCategory(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	cat, err := h.svc.GetCategory(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "category not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, cat)
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageCategories") {
		return
	}
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		DisplayOrder int    `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	cat, err := h.svc.CreateCategory(&models.StoreCategory{
		Name:         req.Name,
		Description:  req.Description,
		DisplayOrder: req.DisplayOrder,
	})
	if err != nil {
		log.Printf("store.createCategory: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create category")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActStoreCategoryCreated,
		Resource:   ievents.ResStoreCategory,
		ResourceID: cat.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"name": cat.Name},
		Fn: func() {
			if h.hub != nil {
				h.hub.BroadcastStoreCatalog(cat, "category_created")
			}
		},
	})
	utils.WriteJSON(w, http.StatusCreated, cat)
}

func (h *Handler) updateCategory(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageCategories") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		DisplayOrder int    `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cat, err := h.svc.UpdateCategory(&models.StoreCategory{
		ID:           id,
		Name:         req.Name,
		Description:  req.Description,
		DisplayOrder: req.DisplayOrder,
	})
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to update category")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActStoreCategoryUpdated,
		Resource:   ievents.ResStoreCategory,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"name": cat.Name},
		Fn: func() {
			if h.hub != nil {
				h.hub.BroadcastStoreCatalog(cat, "category_updated")
			}
		},
	})
	utils.WriteJSON(w, http.StatusOK, cat)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageCategories") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	if err := h.svc.DeleteCategory(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActStoreCategoryDeleted,
		Resource:   ievents.ResStoreCategory,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			if h.hub != nil {
				h.hub.BroadcastStoreCatalog(map[string]int64{"id": id}, "category_deleted")
			}
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Product handlers

// listCategoryProducts handles GET /store/categories/{id}/products
func (h *Handler) listCategoryProducts(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	limit, offset := 50, 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 200 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}
	products, err := h.svc.ListProductsByCategory(id, limit, offset)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if products == nil {
		products = []*models.Product{}
	}
	utils.WriteJSON(w, http.StatusOK, products)
}

func (h *Handler) listProducts(w http.ResponseWriter, r *http.Request) {
	limit, offset := 50, 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 200 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	var products []*models.Product
	var err error
	if catStr := r.URL.Query().Get("category_id"); catStr != "" {
		catID, parseErr := strconv.ParseInt(catStr, 10, 64)
		if parseErr != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid category_id")
			return
		}
		products, err = h.svc.ListProductsByCategory(catID, limit, offset)
	} else {
		products, err = h.svc.ListProducts(limit, offset)
	}
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, products)
}

func (h *Handler) getProduct(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid product ID")
		return
	}
	p, err := h.svc.GetProduct(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "product not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) createProduct(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.product-new") {
		return
	}
	var req struct {
		CategoryID     int64   `json:"category_id"`
		Name           string  `json:"name"`
		Description    string  `json:"description"`
		Price          float64 `json:"price"`
		ImageURL       string  `json:"image_url"`
		Stock          int     `json:"stock"`
		StockUnlimited bool    `json:"stock_unlimited"`
		IsActive       bool    `json:"is_active"`
		SpecialActions string  `json:"special_actions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// req.Price is provided in dollars (float). Convert to cents for storage.
	price := int64(math.Round(req.Price * 100))
	if price < 0 {
		utils.WriteError(w, http.StatusBadRequest, "price must be >= 0")
		return
	}
	sa := req.SpecialActions
	if sa == "" {
		sa = "[]"
	}
	p, err := h.svc.CreateProduct(&models.Product{
		CategoryID:     req.CategoryID,
		Name:           req.Name,
		Description:    req.Description,
		Price:          price,
		ImageURL:       req.ImageURL,
		Stock:          req.Stock,
		StockUnlimited: req.StockUnlimited,
		IsActive:       req.IsActive,
		SpecialActions: sa,
	})
	if err != nil {
		log.Printf("store.createProduct: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create product")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActProductCreated,
		Resource:   ievents.ResProduct,
		ResourceID: p.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"name": p.Name, "price": p.Price},
		Fn: func() {
			if h.hub != nil {
				h.hub.BroadcastStoreCatalog(p, "product_created")
			}
		},
	})
	utils.WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) updateProduct(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.product-edit") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid product ID")
		return
	}
	existing, err := h.svc.GetProduct(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "product not found")
		return
	}
	var req struct {
		CategoryID     *int64   `json:"category_id"`
		Name           *string  `json:"name"`
		Description    *string  `json:"description"`
		Price          *float64 `json:"price"`
		ImageURL       *string  `json:"image_url"`
		Stock          *int     `json:"stock"`
		StockUnlimited *bool    `json:"stock_unlimited"`
		IsActive       *bool    `json:"is_active"`
		SpecialActions *string  `json:"special_actions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.CategoryID != nil {
		existing.CategoryID = *req.CategoryID
	}
	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.Price != nil {
		// req.Price is dollars; convert to cents before comparing/storing
		newPrice := int64(math.Round(*req.Price * 100))
		if newPrice < existing.Price {
			// Price dropped - record old price as original_price for strike-through display
			old := existing.Price
			existing.OriginalPrice = &old
		} else if newPrice > existing.Price {
			// Price went up or reset - clear strike-through
			existing.OriginalPrice = nil
		}
		existing.Price = newPrice
	}
	if req.ImageURL != nil {
		existing.ImageURL = *req.ImageURL
	}
	if req.Stock != nil {
		existing.Stock = *req.Stock
	}
	if req.StockUnlimited != nil {
		existing.StockUnlimited = *req.StockUnlimited
	}
	if req.IsActive != nil {
		existing.IsActive = *req.IsActive
	}
	if req.SpecialActions != nil {
		sa := *req.SpecialActions
		if sa == "" {
			sa = "[]"
		}
		existing.SpecialActions = sa
	}
	updated, err := h.svc.UpdateProduct(existing)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to update product")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActProductUpdated,
		Resource:   ievents.ResProduct,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"name": updated.Name},
		Fn: func() {
			if h.hub != nil {
				h.hub.BroadcastStoreCatalog(updated, "product_updated")
			}
		},
	})
	utils.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteProduct(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.product-delete") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid product ID")
		return
	}
	if err := h.svc.DeleteProduct(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete product")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActProductDeleted,
		Resource:   ievents.ResProduct,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			if h.hub != nil {
				h.hub.BroadcastStoreCatalog(map[string]int64{"id": id}, "product_deleted")
			}
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Cart handlers

func (h *Handler) getCart(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	items, err := h.svc.GetUserCart(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) resolveWalletUser(w http.ResponseWriter, r *http.Request) (int64, bool) {
	callerID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "Unauthorized")
		return 0, false
	}
	targetStr := r.URL.Query().Get("user_id")
	if targetStr != "" {
		targetID, err := strconv.ParseInt(targetStr, 10, 64)
		if err == nil && targetID != callerID {
			if !utils.CheckPerm(w, h.authz, callerID, "store.manageOrders") {
				return 0, false
			}
			return targetID, true
		}
	}
	return callerID, true
}

// getWallet returns the user's wallet balance and recent transactions.
func (h *Handler) getWallet(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.resolveWalletUser(w, r)
	if !ok {
		return
	}

	balance, err := h.svc.WalletRepo.GetBalance(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to get wallet balance")
		return
	}

	txs, err := h.svc.WalletRepo.GetTransactions(userID, 50, 0)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to get wallet transactions")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"balance":      balance,
		"transactions": txs,
	})
}

// topUpWallet creates a credit transaction for the user's wallet.
func (h *Handler) topUpWallet(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.resolveWalletUser(w, r)
	if !ok {
		return
	}

	var req struct {
		Amount      int64  `json:"amount"` // in cents
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if req.Amount <= 0 {
		utils.WriteError(w, http.StatusBadRequest, "Amount must be positive")
		return
	}
	if req.Description == "" {
		req.Description = "Wallet top up"
	}

	tx := &models.WalletTransaction{
		UserID:      userID,
		Amount:      req.Amount,
		Type:        "credit",
		Description: req.Description,
	}

	createdTx, err := h.svc.WalletRepo.CreateTransaction(tx)
	if err != nil {
		log.Printf("Wallet top up error: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to process top up")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"transaction": createdTx,
	})
}

func (h *Handler) listReferenceCodes(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageOrders") {
		return
	}
	limit, offset := 50, 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}
	codes, err := h.svc.ListReferenceCodes(limit, offset)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to list reference codes")
		return
	}
	utils.WriteJSON(w, http.StatusOK, codes)
}

func (h *Handler) createReferenceCode(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageOrders") {
		return
	}
	var req struct {
		Code            string `json:"code"`
		UserID          int64  `json:"user_id"`
		IncentiveAmount int64  `json:"incentive_amount"`
		IsActive        *bool  `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	active := true
	if req.IsActive != nil {
		active = *req.IsActive
	}
	code, err := h.svc.CreateReferenceCode(&models.ReferenceCode{
		Code:            req.Code,
		UserID:          req.UserID,
		IncentiveAmount: req.IncentiveAmount,
		IsActive:        active,
	})
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusCreated, code)
}

func (h *Handler) updateReferenceCode(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageOrders") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid reference code ID")
		return
	}
	var req struct {
		Code            string `json:"code"`
		UserID          int64  `json:"user_id"`
		IncentiveAmount int64  `json:"incentive_amount"`
		IsActive        bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	code, err := h.svc.UpdateReferenceCode(&models.ReferenceCode{
		ID:              id,
		Code:            req.Code,
		UserID:          req.UserID,
		IncentiveAmount: req.IncentiveAmount,
		IsActive:        req.IsActive,
	})
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, code)
}

func (h *Handler) deleteReferenceCode(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageOrders") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid reference code ID")
		return
	}
	if err := h.svc.DeleteReferenceCode(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete reference code")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) addToCart(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		ProductID int64 `json:"product_id"`
		Quantity  int   `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ProductID == 0 {
		utils.WriteError(w, http.StatusBadRequest, "product_id required")
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}
	item, err := h.svc.AddToCart(userID, req.ProductID, req.Quantity)
	if err != nil {
		log.Printf("store.addToCart: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to add item to cart")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, item)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCartItemAdded,
		Resource:   ievents.ResProduct,
		ResourceID: req.ProductID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"quantity": req.Quantity},
		Fn: func() {
			if items, err := h.svc.GetUserCart(userID); err == nil {
				h.hub.PushCartUpdate(userID, items)
			}
		},
	})
}

func (h *Handler) updateCartItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		ProductID int64 `json:"product_id"`
		Quantity  int   `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.UpdateCartItem(userID, req.ProductID, req.Quantity)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to update cart item")
		return
	}
	utils.WriteJSON(w, http.StatusOK, item)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCartItemUpdated,
		Resource:   ievents.ResProduct,
		ResourceID: req.ProductID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"quantity": req.Quantity},
		Fn: func() {
			if items, err := h.svc.GetUserCart(userID); err == nil {
				h.hub.PushCartUpdate(userID, items)
			}
		},
	})
}

func (h *Handler) removeFromCart(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		ProductID int64 `json:"product_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.RemoveFromCart(userID, req.ProductID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to remove item from cart")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "removed"})
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCartItemRemoved,
		Resource:   ievents.ResProduct,
		ResourceID: req.ProductID,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			if items, err := h.svc.GetUserCart(userID); err == nil {
				h.hub.PushCartUpdate(userID, items)
			}
		},
	})
}

func (h *Handler) clearCart(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := h.svc.ClearCart(userID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to clear cart")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActCartCleared,
		IP:       ievents.ClientIP(r),
		Fn: func() {
			h.hub.PushCartUpdate(userID, []*models.CartItem{})
		},
	})
}

// Order handlers

func (h *Handler) createOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Items []struct {
			ProductID int64 `json:"product_id"`
			Quantity  int   `json:"quantity"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Items) == 0 {
		utils.WriteError(w, http.StatusBadRequest, "items required")
		return
	}

	var total int64
	var items []*models.OrderItem
	for _, i := range req.Items {
		if i.Quantity <= 0 {
			utils.WriteError(w, http.StatusBadRequest, "quantity must be > 0")
			return
		}
		p, err := h.svc.GetProduct(i.ProductID)
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, "product not found")
			return
		}
		if !p.IsActive {
			utils.WriteError(w, http.StatusBadRequest, "product not available")
			return
		}
		if !p.StockUnlimited && p.Stock < i.Quantity {
			utils.WriteError(w, http.StatusBadRequest, "insufficient stock")
			return
		}
		total += p.Price * int64(i.Quantity)
		items = append(items, &models.OrderItem{
			ProductID: p.ID,
			Quantity:  i.Quantity,
			Price:     p.Price,
		})
	}

	var parsedUserID *int64
	if ok {
		parsedUserID = &userID
	}

	order, err := h.svc.CreateOrder(&models.Order{
		UserID:     parsedUserID,
		TotalPrice: total,
		Status:     "pending",
	}, items)
	if err != nil {
		log.Printf("store.createOrder: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	_ = h.svc.ClearCart(userID)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActOrderCreated,
		Resource:   ievents.ResOrder,
		ResourceID: order.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"total": total, "items": len(items)},
	})

	if order.UserID != nil {
		go h.svc.SendOrderInboxMessage(*order.UserID, order, "order_created")
	}
	utils.WriteJSON(w, http.StatusCreated, order)
}

func (h *Handler) listOrders(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, offset := 20, 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	canManage, _ := h.authz.HasPermission(userID, "store.manageOrders")
	var orders []*models.Order
	var err error

	if canManage && r.URL.Query().Get("user_id") != "" {
		targetUserID, _ := strconv.ParseInt(r.URL.Query().Get("user_id"), 10, 64)
		orders, err = h.svc.GetUserOrders(targetUserID, limit, offset)
	} else if canManage && r.URL.Query().Get("all") == "true" {
		orders, err = h.svc.ListAllOrders(limit, offset)
	} else {
		orders, err = h.svc.GetUserOrders(userID, limit, offset)
	}

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Augment each order with its latest payment to reduce frontend round-trips.
	var out []map[string]any
	for _, o := range orders {
		var m map[string]any
		jb, _ := json.Marshal(o)
		_ = json.Unmarshal(jb, &m)
		if p, perr := h.svc.GetPaymentForOrder(o.ID); perr == nil {
			m["payment"] = p
		}
		out = append(out, m)
	}
	utils.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) getOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid order ID")
		return
	}
	order, err := h.svc.GetOrder(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "order not found")
		return
	}
	// Only allow user to see their own orders unless admin
	canManage, _ := h.authz.HasPermission(userID, "store.manageOrders")
	if (order.UserID == nil || *order.UserID != userID) && !canManage {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	// Include latest payment in order response to avoid extra client requests
	var m map[string]any
	jb, _ := json.Marshal(order)
	_ = json.Unmarshal(jb, &m)
	if p, perr := h.svc.GetPaymentForOrder(order.ID); perr == nil {
		m["payment"] = p
	}
	utils.WriteJSON(w, http.StatusOK, m)
}

func (h *Handler) updateOrderStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageOrders") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid order ID")
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Status == "" {
		utils.WriteError(w, http.StatusBadRequest, "status required")
		return
	}
	// load current order so we can detect transitions (e.g., to completed)
	beforeOrder, _ := h.svc.GetOrder(id)

	order, err := h.svc.UpdateOrderStatus(id, req.Status)
	if err != nil {
		if strings.Contains(err.Error(), "insufficient stock") {
			utils.WriteError(w, http.StatusConflict, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "failed to update order status")
		return
	}

	// If transitioning to completed, execute special actions now (only once)
	if req.Status == "completed" && beforeOrder != nil && beforeOrder.Status != "completed" {
		// Execute special actions for each order item (if any) and if order has a user
		if order.UserID != nil {
			userID := *order.UserID
			for _, oi := range order.Items {
				if p, err := h.svc.GetProduct(oi.ProductID); err == nil {
					if p.SpecialActions != "" && p.SpecialActions != "[]" {
						var actions []struct {
							Type  string `json:"type"`
							Value string `json:"value"`
						}
						if err := json.Unmarshal([]byte(p.SpecialActions), &actions); err == nil {
							for _, act := range actions {
								if act.Type == "role" {
									_ = h.svc.users.AddRoleByName(userID, act.Value)
								} else if act.Type == "credit" {
									amt, _ := strconv.ParseInt(act.Value, 10, 64)
									if amt > 0 {
										_, _ = h.svc.WalletRepo.CreateTransaction(&models.WalletTransaction{
											UserID:      userID,
											Amount:      amt * int64(oi.Quantity),
											Type:        "credit",
											Description: fmt.Sprintf("Received from order #%d", order.ID),
										})
									}
								}
							}
						}
					}
				}
			}
		}
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActOrderStatusUpdated,
		Resource:   ievents.ResOrder,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"status": req.Status},
	})

	if order.UserID != nil {
		go h.svc.SendOrderInboxMessage(*order.UserID, order, "order_status")
	}
	utils.WriteJSON(w, http.StatusOK, order)
}

func (h *Handler) deleteOrder(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.manageOrders") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid order ID")
		return
	}
	if err := h.svc.DeleteOrder(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete order")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) guestLookupOrder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OrderID string `json:"order_id"`
		Email   string `json:"email"`
		Phone   string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}

	id, err := strconv.ParseInt(req.OrderID, 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid order id")
		return
	}

	order, err := h.svc.GetGuestOrder(id, req.Email, req.Phone)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "order not found or details incorrect")
		return
	}

	utils.WriteJSON(w, http.StatusOK, order)
}

// Checkout handler

func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	var req models.CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Items) == 0 {
		utils.WriteError(w, http.StatusBadRequest, "items required")
		return
	}

	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		if !req.IsGuest {
			utils.WriteError(w, http.StatusUnauthorized, "unauthorized or missing guest info")
			return
		}
		userID = 0 // Represents guest
	}

	if req.Currency == "" {
		req.Currency = "usd"
	}

	resp, err := h.svc.Checkout(userID, &req)
	if err != nil {
		log.Printf("store.checkout: %v", err)
		if strings.Contains(err.Error(), "insufficient stock") {
			utils.WriteError(w, http.StatusConflict, "The order failed because someone else had already checked out and the product is no longer in stock.")
			return
		}
		if strings.Contains(err.Error(), "reference code") {
			utils.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "checkout failed")
		return
	}

	// Notify only the purchasing user of the outcome via WebSocket
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActCheckout,
		Resource: ievents.ResOrder,
		IP:       ievents.ClientIP(r),
		Meta:     map[string]interface{}{"status": resp.Status, "currency": req.Currency},
		Fn: func() {
			if h.hub != nil {
				action := "purchase_success"
				if resp.Status == "failed" {
					action = "purchase_failure"
				}
				h.hub.SendToUser(userID, buildStoreMsg(action, resp))
			}
		},
	})

	httpStatus := http.StatusCreated
	if resp.Status == "failed" {
		httpStatus = http.StatusPaymentRequired
	}
	utils.WriteJSON(w, httpStatus, resp)
}

// buildStoreMsg creates a store:update WebSocket message for delivery to a specific user.
func buildStoreMsg(action string, data interface{}) *ws.Message {
	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"data":   data,
	})
	return &ws.Message{Type: ws.StoreUpdate, Payload: payload}
}

// Subscription plan handlers

func (h *Handler) listPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.svc.ListPlans()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if plans == nil {
		plans = []*models.SubscriptionPlan{}
	}
	utils.WriteJSON(w, http.StatusOK, plans)
}

func (h *Handler) createPlan(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.managePlans") {
		return
	}
	var req struct {
		Name          string `json:"name"`
		Description   string `json:"description"`
		PriceCents    int64  `json:"price_cents"`
		Currency      string `json:"currency"`
		IntervalUnit  string `json:"interval_unit"`
		IntervalCount int    `json:"interval_count"`
		TrialDays     int    `json:"trial_days"`
		StripePriceID string `json:"stripe_price_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	if req.Currency == "" {
		req.Currency = "usd"
	}
	if req.IntervalUnit == "" {
		req.IntervalUnit = "month"
	}
	if req.IntervalCount <= 0 {
		req.IntervalCount = 1
	}
	plan, err := h.svc.CreatePlan(&models.SubscriptionPlan{
		Name:          req.Name,
		Description:   req.Description,
		PriceCents:    req.PriceCents,
		Currency:      req.Currency,
		IntervalUnit:  req.IntervalUnit,
		IntervalCount: req.IntervalCount,
		TrialDays:     req.TrialDays,
		StripePriceID: req.StripePriceID,
		IsActive:      true,
	})
	if err != nil {
		log.Printf("store.createPlan: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create plan")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActPlanCreated,
		Resource:   ievents.ResPlan,
		ResourceID: plan.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"name": plan.Name},
	})
	utils.WriteJSON(w, http.StatusCreated, plan)
}

func (h *Handler) updatePlan(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.managePlans") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid plan ID")
		return
	}
	existing, err := h.svc.GetPlan(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "plan not found")
		return
	}
	var req struct {
		Name          *string `json:"name"`
		Description   *string `json:"description"`
		PriceCents    *int64  `json:"price_cents"`
		Currency      *string `json:"currency"`
		IntervalUnit  *string `json:"interval_unit"`
		IntervalCount *int    `json:"interval_count"`
		TrialDays     *int    `json:"trial_days"`
		StripePriceID *string `json:"stripe_price_id"`
		IsActive      *bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.PriceCents != nil {
		existing.PriceCents = *req.PriceCents
	}
	if req.Currency != nil {
		existing.Currency = *req.Currency
	}
	if req.IntervalUnit != nil {
		existing.IntervalUnit = *req.IntervalUnit
	}
	if req.IntervalCount != nil {
		existing.IntervalCount = *req.IntervalCount
	}
	if req.TrialDays != nil {
		existing.TrialDays = *req.TrialDays
	}
	if req.StripePriceID != nil {
		existing.StripePriceID = *req.StripePriceID
	}
	if req.IsActive != nil {
		existing.IsActive = *req.IsActive
	}
	updated, err := h.svc.UpdatePlan(existing)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to update plan")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActPlanUpdated,
		Resource:   ievents.ResPlan,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"name": updated.Name},
	})
	utils.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deletePlan(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "store.managePlans") {
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid plan ID")
		return
	}
	if err := h.svc.DeletePlan(id); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete plan")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActPlanDeleted,
		Resource:   ievents.ResPlan,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Subscription handlers

func (h *Handler) subscribe(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		PlanID int64  `json:"plan_id"`
		Email  string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PlanID == 0 {
		utils.WriteError(w, http.StatusBadRequest, "plan_id required")
		return
	}
	sub, err := h.svc.Subscribe(userID, req.PlanID, req.Email)
	if err != nil {
		log.Printf("store.subscribe: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActSubscriptionCreated,
		Resource:   ievents.ResSubscription,
		ResourceID: sub.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"plan_id": req.PlanID},
	})
	utils.WriteJSON(w, http.StatusCreated, sub)
}

func (h *Handler) getCurrentSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sub, err := h.svc.GetUserSubscription(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sub == nil {
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"subscription": nil})
		return
	}
	utils.WriteJSON(w, http.StatusOK, sub)
}

func (h *Handler) listSubscriptions(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	subs, err := h.svc.ListUserSubscriptions(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if subs == nil {
		subs = []*models.Subscription{}
	}
	utils.WriteJSON(w, http.StatusOK, subs)
}

func (h *Handler) cancelSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid subscription ID")
		return
	}
	var req struct {
		AtPeriodEnd bool `json:"at_period_end"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	sub, err := h.svc.CancelSubscription(userID, id, req.AtPeriodEnd)
	if err != nil {
		log.Printf("store.cancelSubscription: %v", err)
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActSubscriptionCancelled,
		Resource:   ievents.ResSubscription,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"at_period_end": req.AtPeriodEnd},
	})
	utils.WriteJSON(w, http.StatusOK, sub)
}

// Payment status handler

func (h *Handler) getPaymentStatus(w http.ResponseWriter, r *http.Request) {
	_, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	ref := chi.URLParam(r, "ref")
	if ref == "" {
		utils.WriteError(w, http.StatusBadRequest, "provider ref required")
		return
	}
	status, err := h.svc.GetPaymentStatus(ref)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": status})
}

// Get latest payment for an order
func (h *Handler) getOrderPayment(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid order ID")
		return
	}
	order, err := h.svc.GetOrder(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "order not found")
		return
	}
	// Only allow user to see their own order payments unless admin
	canManage, _ := h.authz.HasPermission(userID, "store.manageOrders")
	if (order.UserID == nil || *order.UserID != userID) && !canManage {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	p, err := h.svc.GetPaymentForOrder(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "payment not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, p)
}
func (h *Handler) getCards(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.resolveWalletUser(w, r)
	if !ok {
		return
	}

	cards, err := h.svc.WalletRepo.GetCards(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "Failed to get cards")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"cards": cards,
	})
}

func (h *Handler) addCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.resolveWalletUser(w, r)
	if !ok {
		return
	}

	var req models.UserCard
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	req.UserID = userID

	card, err := h.svc.WalletRepo.AddCard(&req)
	if err != nil {
		log.Printf("Wallet add card error: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to add card")
		return
	}

	utils.WriteJSON(w, http.StatusOK, card)
}

func (h *Handler) updateCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.resolveWalletUser(w, r)
	if !ok {
		return
	}

	cardIDStr := chi.URLParam(r, "id")
	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid card ID")
		return
	}

	var req models.UserCard
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	req.ID = cardID
	req.UserID = userID

	card, err := h.svc.WalletRepo.UpdateCard(&req)
	if err != nil {
		log.Printf("Wallet update card error: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to update card")
		return
	}

	utils.WriteJSON(w, http.StatusOK, card)
}

func (h *Handler) deleteCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.resolveWalletUser(w, r)
	if !ok {
		return
	}

	cardIDStr := chi.URLParam(r, "id")
	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "Invalid card ID")
		return
	}

	err = h.svc.WalletRepo.DeleteCard(cardID, userID)
	if err != nil {
		log.Printf("Wallet delete card error: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "Failed to delete card")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
