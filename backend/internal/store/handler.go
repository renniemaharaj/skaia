package store

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// Handler exposes all store HTTP endpoints.
type Handler struct {
	svc *Service
	hub *ws.Hub
}

// NewHandler creates a Handler.
func NewHandler(svc *Service, hub *ws.Hub) *Handler {
	return &Handler{svc: svc, hub: hub}
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

		// Cart routes (all require auth)
		r.With(jwt).Get("/cart", h.getCart)
		r.With(jwt).Post("/cart/add", h.addToCart)
		r.With(jwt).Put("/cart/update", h.updateCartItem)
		r.With(jwt).Delete("/cart/remove", h.removeFromCart)
		r.With(jwt).Delete("/cart", h.clearCart)

		// Checkout (payment) — all payment logic is backend-only
		r.With(jwt).Post("/checkout", h.checkout)

		// Order routes
		r.With(jwt).Post("/orders", h.createOrder)
		r.With(jwt).Get("/orders", h.listOrders)
		r.With(jwt).Get("/orders/{id}", h.getOrder)
		r.With(jwt).Put("/orders/{id}/status", h.updateOrderStatus)

		// Legacy cart/purchase aliases kept for backwards compatibility
		r.With(jwt).Post("/cart/purchase", h.createOrder)
		r.With(jwt).Post("/purchase", h.createOrder)

		// Checkout (payment) — all payment logic is backend-only
		r.With(jwt).Post("/checkout", h.checkout)
	})
}

func (h *Handler) parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

// Category handlers

func (h *Handler) listCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.svc.ListCategories()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, cats)
}

func (h *Handler) getCategory(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	cat, err := h.svc.GetCategory(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "category not found")
		return
	}
	WriteJSON(w, http.StatusOK, cat)
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok || !HasClaim(claims, "store.manageCategories") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		DisplayOrder int    `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	cat, err := h.svc.CreateCategory(&models.StoreCategory{
		Name:         req.Name,
		Description:  req.Description,
		DisplayOrder: req.DisplayOrder,
	})
	if err != nil {
		log.Printf("store.createCategory: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to create category")
		return
	}
	if h.hub != nil {
		h.hub.BroadcastStoreCatalog(cat, "category_created")
	}
	WriteJSON(w, http.StatusCreated, cat)
}

func (h *Handler) updateCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok || !HasClaim(claims, "store.manageCategories") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	var req struct {
		Name         string `json:"name"`
		Description  string `json:"description"`
		DisplayOrder int    `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cat, err := h.svc.UpdateCategory(&models.StoreCategory{
		ID:           id,
		Name:         req.Name,
		Description:  req.Description,
		DisplayOrder: req.DisplayOrder,
	})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to update category")
		return
	}
	if h.hub != nil {
		h.hub.BroadcastStoreCatalog(cat, "category_updated")
	}
	WriteJSON(w, http.StatusOK, cat)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok || !HasClaim(claims, "store.manageCategories") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	if err := h.svc.DeleteCategory(id); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}
	if h.hub != nil {
		h.hub.BroadcastStoreCatalog(map[string]int64{"id": id}, "category_deleted")
	}
	WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Product handlers

// listCategoryProducts handles GET /store/categories/{id}/products
func (h *Handler) listCategoryProducts(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid category ID")
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
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if products == nil {
		products = []*models.Product{}
	}
	WriteJSON(w, http.StatusOK, products)
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
			WriteError(w, http.StatusBadRequest, "invalid category_id")
			return
		}
		products, err = h.svc.ListProductsByCategory(catID, limit, offset)
	} else {
		products, err = h.svc.ListProducts(limit, offset)
	}
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, products)
}

func (h *Handler) getProduct(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid product ID")
		return
	}
	p, err := h.svc.GetProduct(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "product not found")
		return
	}
	WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) createProduct(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok || !HasClaim(claims, "store.product-new") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
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
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	p, err := h.svc.CreateProduct(&models.Product{
		CategoryID:     req.CategoryID,
		Name:           req.Name,
		Description:    req.Description,
		Price:          req.Price,
		ImageURL:       req.ImageURL,
		Stock:          req.Stock,
		StockUnlimited: req.StockUnlimited,
		IsActive:       req.IsActive,
	})
	if err != nil {
		log.Printf("store.createProduct: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to create product")
		return
	}
	if h.hub != nil {
		h.hub.BroadcastStoreCatalog(p, "product_created")
	}
	WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) updateProduct(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok || !HasClaim(claims, "store.product-edit") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid product ID")
		return
	}
	existing, err := h.svc.GetProduct(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "product not found")
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
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
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
		newPrice := *req.Price
		if newPrice < existing.Price {
			// Price dropped — record old price as original_price for strike-through display
			old := existing.Price
			existing.OriginalPrice = &old
		} else if newPrice > existing.Price {
			// Price went up or reset — clear strike-through
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
	updated, err := h.svc.UpdateProduct(existing)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to update product")
		return
	}
	if h.hub != nil {
		h.hub.BroadcastStoreCatalog(updated, "product_updated")
	}
	WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteProduct(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok || !HasClaim(claims, "store.product-delete") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid product ID")
		return
	}
	if err := h.svc.DeleteProduct(id); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to delete product")
		return
	}
	if h.hub != nil {
		h.hub.BroadcastStoreCatalog(map[string]int64{"id": id}, "product_deleted")
	}
	WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Cart handlers

func (h *Handler) getCart(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	items, err := h.svc.GetUserCart(claims.UserID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

func (h *Handler) addToCart(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		ProductID int64 `json:"product_id"`
		Quantity  int   `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ProductID == 0 {
		WriteError(w, http.StatusBadRequest, "product_id required")
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}
	item, err := h.svc.AddToCart(claims.UserID, req.ProductID, req.Quantity)
	if err != nil {
		log.Printf("store.addToCart: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to add item to cart")
		return
	}
	WriteJSON(w, http.StatusCreated, item)
}

func (h *Handler) updateCartItem(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		ProductID int64 `json:"product_id"`
		Quantity  int   `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item, err := h.svc.UpdateCartItem(claims.UserID, req.ProductID, req.Quantity)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to update cart item")
		return
	}
	WriteJSON(w, http.StatusOK, item)
}

func (h *Handler) removeFromCart(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		ProductID int64 `json:"product_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.RemoveFromCart(claims.UserID, req.ProductID); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to remove item from cart")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (h *Handler) clearCart(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := h.svc.ClearCart(claims.UserID); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to clear cart")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
}

// Order handlers

func (h *Handler) createOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Items []struct {
			ProductID int64   `json:"product_id"`
			Quantity  int     `json:"quantity"`
			Price     float64 `json:"price"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Items) == 0 {
		WriteError(w, http.StatusBadRequest, "items required")
		return
	}

	var total float64
	var items []*models.OrderItem
	for _, i := range req.Items {
		total += i.Price * float64(i.Quantity)
		items = append(items, &models.OrderItem{
			ProductID: i.ProductID,
			Quantity:  i.Quantity,
			Price:     i.Price,
		})
	}

	order, err := h.svc.CreateOrder(&models.Order{
		UserID:     claims.UserID,
		TotalPrice: total,
		Status:     "pending",
	}, items)
	if err != nil {
		log.Printf("store.createOrder: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	// Clear cart after successful purchase
	_ = h.svc.ClearCart(claims.UserID)

	WriteJSON(w, http.StatusCreated, order)
}

func (h *Handler) listOrders(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit, offset := 20, 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}
	orders, err := h.svc.GetUserOrders(claims.UserID, limit, offset)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, orders)
}

func (h *Handler) getOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid order ID")
		return
	}
	order, err := h.svc.GetOrder(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "order not found")
		return
	}
	// Only allow user to see their own orders unless admin
	if order.UserID != claims.UserID && !HasClaim(claims, "store.manageOrders") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	WriteJSON(w, http.StatusOK, order)
}

func (h *Handler) updateOrderStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok || !HasClaim(claims, "store.manageOrders") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid order ID")
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Status == "" {
		WriteError(w, http.StatusBadRequest, "status required")
		return
	}
	order, err := h.svc.UpdateOrderStatus(id, req.Status)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to update order status")
		return
	}
	WriteJSON(w, http.StatusOK, order)
}

// ── Checkout handler ──────────────────────────────────────────────────────────
// All payment logic is server-side only. The client submits items and receives
// a CheckoutResponse. The actual charge happens via the PaymentProvider abstraction.

func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req models.CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Items) == 0 {
		WriteError(w, http.StatusBadRequest, "items required")
		return
	}
	if req.Currency == "" {
		req.Currency = "usd"
	}

	resp, err := h.svc.Checkout(claims.UserID, &req)
	if err != nil {
		log.Printf("store.checkout: %v", err)
		WriteError(w, http.StatusInternalServerError, "checkout failed")
		return
	}

	// Notify only the purchasing user of the outcome via WebSocket
	if h.hub != nil {
		action := "purchase_success"
		if resp.Status == "failed" {
			action = "purchase_failure"
		}
		h.hub.SendToUser(claims.UserID, buildStoreMsg(action, resp))
	}

	httpStatus := http.StatusCreated
	if resp.Status == "failed" {
		httpStatus = http.StatusPaymentRequired
	}
	WriteJSON(w, httpStatus, resp)
}

// buildStoreMsg creates a store:update WebSocket message for delivery to a specific user.
func buildStoreMsg(action string, data interface{}) *ws.Message {
	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"data":   data,
	})
	return &ws.Message{Type: ws.StoreUpdate, Payload: payload}
}
