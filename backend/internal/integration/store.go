package integration

import (
	"database/sql"
	"fmt"
)

// RegisterStoreTests registers all store-domain integration tests onto s.
func RegisterStoreTests(s *Suite, db *sql.DB) {
	// ── shared state ──────────────────────────────────────────────────────────
	var (
		adminEmail    = uniq("sadmin") + "@skaia.test"
		adminUsername = uniq("sadmin")
		adminPassword = "SAdminPass123!"
		adminToken    string

		userEmail    = uniq("suser") + "@skaia.test"
		userUsername = uniq("suser")
		userPassword = "SUserPass123!"
		userToken    string

		categoryID int64
		productID  int64
		orderID    int64
	)

	// ── setup ─────────────────────────────────────────────────────────────────
	s.Add("store/setup", func(t *T) {
		// Admin
		resp := s.POST("/api/auth/register", map[string]any{
			"username": adminUsername,
			"email":    adminEmail,
			"password": adminPassword,
		}, nil)
		t.RequireStatus(resp, 201)
		adminID := ID(nested(ReadJSON(resp), "user", "id"))
		t.Require(adminID != 0, "admin user id must be non-zero")
		t.RequireNoError(grantAdminRole(db, adminID))

		resp2 := s.POST("/api/auth/login", map[string]any{
			"email": adminEmail, "password": adminPassword,
		}, nil)
		t.RequireStatus(resp2, 200)
		adminToken = Str(ReadJSON(resp2)["access_token"])
		t.Require(adminToken != "", "admin token must be non-empty")

		// Regular user
		resp3 := s.POST("/api/auth/register", map[string]any{
			"username": userUsername,
			"email":    userEmail,
			"password": userPassword,
		}, nil)
		t.RequireStatus(resp3, 201)
		userToken = Str(ReadJSON(resp3)["access_token"])
		t.Require(userToken != "", "user token must be non-empty")
	})

	// ── store/create_category ─────────────────────────────────────────────────
	s.Add("store/create_category", func(t *T) {
		resp := s.POST("/api/store/categories", map[string]any{
			"name":        uniq("Electronics"),
			"description": "Electronic products for testing",
		}, Bearer(adminToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		categoryID = ID(data["id"])
		t.Require(categoryID != 0, "created category must have an id")
	})

	// ── store/create_category_requires_admin ──────────────────────────────────
	s.Add("store/create_category_requires_admin", func(t *T) {
		resp := s.POST("/api/store/categories", map[string]any{
			"name": uniq("UnauthorizedCat"),
		}, Bearer(userToken))
		t.Require(resp.StatusCode == 403, "non-admin must get 403, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── store/list_categories ─────────────────────────────────────────────────
	s.Add("store/list_categories", func(t *T) {
		resp := s.GET("/api/store/categories", nil)
		t.RequireStatus(resp, 200)
		list := ReadJSONList(resp)
		t.Require(len(list) >= 1, "must return at least the created category")
	})

	// ── store/create_product ──────────────────────────────────────────────────
	s.Add("store/create_product", func(t *T) {
		resp := s.POST("/api/store/products", map[string]any{
			"category_id": categoryID,
			"name":        uniq("Widget"),
			"description": "A fine widget for integration testing",
			"price":       29.99,
			"stock":       100,
			"is_active":   true,
		}, Bearer(adminToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		productID = ID(data["id"])
		t.Require(productID != 0, "created product must have an id")
	})

	// ── store/get_product ─────────────────────────────────────────────────────
	s.Add("store/get_product", func(t *T) {
		resp := s.GET(fmt.Sprintf("/api/store/products/%d", productID), nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.Require(ID(data["id"]) == productID, "fetched product id must match")
	})

	// ── store/list_products ───────────────────────────────────────────────────
	s.Add("store/list_products", func(t *T) {
		resp := s.GET("/api/store/products", nil)
		t.RequireStatus(resp, 200)
		list := ReadJSONList(resp)
		t.Require(len(list) >= 1, "must return at least the created product")
	})

	// ── store/update_product ──────────────────────────────────────────────────
	s.Add("store/update_product", func(t *T) {
		newPrice := 49.99
		resp := s.PUT(fmt.Sprintf("/api/store/products/%d", productID), map[string]any{
			"price": newPrice,
			"stock": 50,
		}, Bearer(adminToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		got, _ := data["price"].(float64)
		t.Require(got > 49.0 && got < 50.0, "price must be updated to ~49.99, got %v", got)
	})

	// ── store/update_product_verify_persistence ───────────────────────────────
	s.Add("store/update_product_verify_persistence", func(t *T) {
		resp := s.GET(fmt.Sprintf("/api/store/products/%d", productID), nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		got, _ := data["price"].(float64)
		t.Require(got > 49.0, "price update must persist in DB, got %v", got)
		stock, _ := data["stock"].(float64)
		t.Require(int(stock) == 50, "stock must be 50 after update, got %v", stock)
	})

	// ── store/add_to_cart ─────────────────────────────────────────────────────
	s.Add("store/add_to_cart", func(t *T) {
		resp := s.POST("/api/store/cart/add", map[string]any{
			"product_id": productID,
			"quantity":   2,
		}, Bearer(userToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		qty, _ := data["quantity"].(float64)
		t.Require(int(qty) == 2, "cart item quantity must be 2, got %v", qty)
	})

	// ── store/add_to_cart_upsert ──────────────────────────────────────────────
	s.Add("store/add_to_cart_upsert", func(t *T) {
		// Adding the same product again must add quantities (ON CONFLICT upsert).
		resp := s.POST("/api/store/cart/add", map[string]any{
			"product_id": productID,
			"quantity":   3,
		}, Bearer(userToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		qty, _ := data["quantity"].(float64)
		t.Require(int(qty) == 5, "upserted quantity must be 2+3=5, got %v", qty)
	})

	// ── store/get_cart ────────────────────────────────────────────────────────
	s.Add("store/get_cart", func(t *T) {
		resp := s.GET("/api/store/cart", Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		items, _ := data["items"].([]any)
		t.Require(len(items) == 1, "cart must have exactly 1 item, got %d", len(items))
	})

	// ── store/update_cart ─────────────────────────────────────────────────────
	s.Add("store/update_cart_item", func(t *T) {
		resp := s.PUT("/api/store/cart/update", map[string]any{
			"product_id": productID,
			"quantity":   1,
		}, Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		qty, _ := data["quantity"].(float64)
		t.Require(int(qty) == 1, "updated cart item quantity must be 1, got %v", qty)
	})

	// ── store/remove_from_cart ────────────────────────────────────────────────
	s.Add("store/remove_from_cart", func(t *T) {
		resp := s.DELETE("/api/store/cart/remove", map[string]any{
			"product_id": productID,
		}, Bearer(userToken))
		t.RequireStatus(resp, 200)

		// Verify the cart is now empty.
		resp2 := s.GET("/api/store/cart", Bearer(userToken))
		t.RequireStatus(resp2, 200)
		data := ReadJSON(resp2)
		items, _ := data["items"].([]any)
		t.Require(len(items) == 0, "cart must be empty after remove, got %d", len(items))
	})

	// ── store/create_order ────────────────────────────────────────────────────
	s.Add("store/create_order", func(t *T) {
		resp := s.POST("/api/store/orders", map[string]any{
			"items": []map[string]any{
				{"product_id": productID, "quantity": 1, "price": 49.99},
			},
		}, Bearer(userToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		orderID = ID(data["id"])
		t.Require(orderID != 0, "created order must have an id")
		t.AssertEqual(Str(data["status"]), "pending", "initial order status")
	})

	// ── store/get_order ───────────────────────────────────────────────────────
	s.Add("store/get_order", func(t *T) {
		resp := s.GET(fmt.Sprintf("/api/store/orders/%d", orderID), Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.Require(ID(data["id"]) == orderID, "fetched order id must match")
	})

	// ── store/update_order_status ─────────────────────────────────────────────
	s.Add("store/update_order_status", func(t *T) {
		resp := s.PUT(fmt.Sprintf("/api/store/orders/%d/status", orderID), map[string]any{
			"status": "completed",
		}, Bearer(adminToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.AssertEqual(Str(data["status"]), "completed", "order status after update")
	})

	// ── store/update_order_verify_persistence ─────────────────────────────────
	s.Add("store/update_order_verify_persistence", func(t *T) {
		resp := s.GET(fmt.Sprintf("/api/store/orders/%d", orderID), Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.AssertEqual(Str(data["status"]), "completed", "order status must persist in DB")
	})

	// ── store/delete_product ──────────────────────────────────────────────────
	s.Add("store/delete_product", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/api/store/products/%d", productID), nil, Bearer(adminToken))
		t.RequireStatus(resp, 200)

		// Verify it's gone.
		resp2 := s.GET(fmt.Sprintf("/api/store/products/%d", productID), nil)
		t.Require(resp2.StatusCode == 404,
			"deleted product must return 404, got %d", resp2.StatusCode)
		resp2.Body.Close()
	})

	// ── store/delete_category ─────────────────────────────────────────────────
	s.Add("store/delete_category", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/api/store/categories/%d", categoryID), nil, Bearer(adminToken))
		t.RequireStatus(resp, 200)
	})
}
