package store

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"

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

		// Cart routes (all require auth)
		r.With(jwt).Get("/cart", h.getCart)
		r.With(jwt).Post("/cart/add", h.addToCart)
		r.With(jwt).Put("/cart/update", h.updateCartItem)
		r.With(jwt).Delete("/cart/remove", h.removeFromCart)
		r.With(jwt).Delete("/cart", h.clearCart)

		// Checkout — all payment logic is backend-only
		r.With(jwt).Post("/checkout", h.checkout)

		// Order routes
		r.With(jwt).Post("/orders", h.createOrder)
		r.With(jwt).Get("/orders", h.listOrders)
		r.With(jwt).Get("/orders/{id}", h.getOrder)
		r.With(jwt).Put("/orders/{id}/status", h.updateOrderStatus)

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
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	price := int64(math.Round(req.Price))
	if price < 0 {
		utils.WriteError(w, http.StatusBadRequest, "price must be >= 0")
		return
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
		newPrice := int64(math.Round(*req.Price))
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

	// resolve server-side prices, never trust client
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

	order, err := h.svc.CreateOrder(&models.Order{
		UserID:     userID,
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
	orders, err := h.svc.GetUserOrders(userID, limit, offset)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, orders)
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
	if order.UserID != userID && !canManage {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}
	utils.WriteJSON(w, http.StatusOK, order)
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
	order, err := h.svc.UpdateOrderStatus(id, req.Status)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to update order status")
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActOrderStatusUpdated,
		Resource:   ievents.ResOrder,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"status": req.Status},
	})
	utils.WriteJSON(w, http.StatusOK, order)
}

// Checkout handler

func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req models.CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Items) == 0 {
		utils.WriteError(w, http.StatusBadRequest, "items required")
		return
	}
	if req.Currency == "" {
		req.Currency = "usd"
	}

	resp, err := h.svc.Checkout(userID, &req)
	if err != nil {
		log.Printf("store.checkout: %v", err)
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
