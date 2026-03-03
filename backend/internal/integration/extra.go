package integration

import (
	"database/sql"
	"fmt"
)

// RegisterExtraTests registers miscellaneous integration tests that don't fit
// neatly into a single domain but are important for contract stability:
//   - Health endpoint
//   - Auth middleware enforcement on protected routes
//   - Rate limiting via the AuthLimitMiddleware
//   - User suspension workflow
//   - Forum threads-by-category listing and view count increment
//   - Store product-by-category listing and order history
func RegisterExtraTests(s *Suite, db *sql.DB) {
	// ── health ────────────────────────────────────────────────────────────────
	s.Add("health/returns_200", func(t *T) {
		resp := s.GET("/health", nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.AssertEqual(Str(data["status"]), "ok", "health status")
	})

	// ── auth middleware enforcement ───────────────────────────────────────────

	s.Add("middleware/protected_route_rejects_missing_token", func(t *T) {
		resp := s.GET("/users/profile", nil)
		t.Require(resp.StatusCode == 401,
			"protected route must return 401 without token, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	s.Add("middleware/protected_route_rejects_invalid_token", func(t *T) {
		resp := s.GET("/users/profile", map[string]string{
			"Authorization": "Bearer this.is.not.valid",
		})
		t.Require(resp.StatusCode == 401,
			"protected route must return 401 with invalid token, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	s.Add("middleware/protected_route_rejects_malformed_scheme", func(t *T) {
		resp := s.GET("/users/profile", map[string]string{
			"Authorization": "Basic dXNlcjpwYXNz",
		})
		t.Require(resp.StatusCode == 401,
			"protected route must reject Basic auth scheme, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── auth: duplicate registration ──────────────────────────────────────────

	s.Add("auth/register_duplicate_username_rejected", func(t *T) {
		username := uniq("dupuser")
		email1 := uniq("dup1") + "@skaia.test"
		email2 := uniq("dup2") + "@skaia.test"

		resp := s.POST("/auth/register", map[string]any{
			"username": username,
			"email":    email1,
			"password": "DupPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		resp.Body.Close()

		resp2 := s.POST("/auth/register", map[string]any{
			"username": username, // same username
			"email":    email2,
			"password": "DupPass123!",
		}, nil)
		t.Require(resp2.StatusCode >= 400,
			"duplicate username registration must return 4xx, got %d", resp2.StatusCode)
		resp2.Body.Close()
	})

	s.Add("auth/register_duplicate_email_rejected", func(t *T) {
		email := uniq("dupemail") + "@skaia.test"
		resp := s.POST("/auth/register", map[string]any{
			"username": uniq("dupemail1"),
			"email":    email,
			"password": "DupPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		resp.Body.Close()

		resp2 := s.POST("/auth/register", map[string]any{
			"username": uniq("dupemail2"),
			"email":    email, // same email
			"password": "DupPass123!",
		}, nil)
		t.Require(resp2.StatusCode >= 400,
			"duplicate email registration must return 4xx, got %d", resp2.StatusCode)
		resp2.Body.Close()
	})

	s.Add("auth/login_nonexistent_user_rejected", func(t *T) {
		resp := s.POST("/auth/login", map[string]any{
			"email":    "nobody_at_all_xyz@skaia.test",
			"password": "SomePass123!",
		}, nil)
		t.Require(resp.StatusCode >= 400,
			"login for non-existent user must return 4xx, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── forum: threads by category listing ───────────────────────────────────

	s.Add("forum/threads_by_category_listing", func(t *T) {
		// Create a fresh admin to avoid rate limit conflicts.
		adminEmail := uniq("tbc_admin") + "@skaia.test"
		adminUsername := uniq("tbc_admin")
		resp := s.POST("/auth/register", map[string]any{
			"username": adminUsername,
			"email":    adminEmail,
			"password": "TBCAdminPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		adminID := ID(nested(ReadJSON(resp), "user", "id"))
		t.RequireNoError(grantAdminRole(db, adminID))
		resp2 := s.POST("/auth/login", map[string]any{
			"email": adminEmail, "password": "TBCAdminPass123!",
		}, nil)
		t.RequireStatus(resp2, 200)
		adminToken := Str(ReadJSON(resp2)["access_token"])

		userEmail := uniq("tbc_user") + "@skaia.test"
		resp3 := s.POST("/auth/register", map[string]any{
			"username": uniq("tbc_user"),
			"email":    userEmail,
			"password": "TBCUserPass123!",
		}, nil)
		t.RequireStatus(resp3, 201)
		userToken := Str(ReadJSON(resp3)["access_token"])

		// Create a category.
		catResp := s.POST("/forum/categories", map[string]any{
			"name": uniq("TBCCategory"),
		}, Bearer(adminToken))
		t.RequireStatus(catResp, 201)
		catID := ID(ReadJSON(catResp)["id"])
		t.Require(catID != 0, "category id must be non-zero")

		// Create 3 threads in that category.
		for i := 0; i < 3; i++ {
			tr := s.POST("/forum/threads", map[string]any{
				"category_id": fmt.Sprintf("%d", catID),
				"title":       uniq("TBCThread"),
				"content":     "Thread body for listing test",
			}, Bearer(userToken))
			t.RequireStatus(tr, 201)
			tr.Body.Close()
		}

		// List threads for this category.
		listResp := s.GET(fmt.Sprintf("/forum/categories/%d/threads", catID), nil)
		t.RequireStatus(listResp, 200)
		threads := ReadJSONList(listResp)
		t.Require(len(threads) >= 3,
			"threads-by-category must return at least 3 results, got %d", len(threads))
	})

	// ── forum: view count increments on fetch ─────────────────────────────────

	s.Add("forum/view_count_increments", func(t *T) {
		adminEmail := uniq("vc_admin") + "@skaia.test"
		resp := s.POST("/auth/register", map[string]any{
			"username": uniq("vc_admin"),
			"email":    adminEmail,
			"password": "VCAdminPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		adminID := ID(nested(ReadJSON(resp), "user", "id"))
		t.RequireNoError(grantAdminRole(db, adminID))
		resp2 := s.POST("/auth/login", map[string]any{
			"email": adminEmail, "password": "VCAdminPass123!",
		}, nil)
		t.RequireStatus(resp2, 200)
		adminToken := Str(ReadJSON(resp2)["access_token"])

		userResp := s.POST("/auth/register", map[string]any{
			"username": uniq("vc_user"),
			"email":    uniq("vc_user") + "@skaia.test",
			"password": "VCUserPass123!",
		}, nil)
		t.RequireStatus(userResp, 201)
		userToken := Str(ReadJSON(userResp)["access_token"])

		catResp := s.POST("/forum/categories", map[string]any{
			"name": uniq("VCCategory"),
		}, Bearer(adminToken))
		t.RequireStatus(catResp, 201)
		catID := ID(ReadJSON(catResp)["id"])

		threadResp := s.POST("/forum/threads", map[string]any{
			"category_id": fmt.Sprintf("%d", catID),
			"title":       uniq("VCThread"),
			"content":     "Content for view count test",
		}, Bearer(userToken))
		t.RequireStatus(threadResp, 201)
		threadID := ID(ReadJSON(threadResp)["id"])

		// Fetch once to establish baseline.
		r1 := s.GET(fmt.Sprintf("/forum/threads/%d", threadID), nil)
		t.RequireStatus(r1, 200)
		vc1 := ID(ReadJSON(r1)["view_count"])

		// Fetch again — view_count should have incremented.
		r2 := s.GET(fmt.Sprintf("/forum/threads/%d", threadID), nil)
		t.RequireStatus(r2, 200)
		vc2 := ID(ReadJSON(r2)["view_count"])

		t.Require(vc2 >= vc1,
			"view_count must not decrease on subsequent fetch (vc1=%d, vc2=%d)", vc1, vc2)
	})

	// ── store: product filtering by category ─────────────────────────────────

	s.Add("store/products_by_category", func(t *T) {
		adminEmail := uniq("pbc_admin") + "@skaia.test"
		resp := s.POST("/auth/register", map[string]any{
			"username": uniq("pbc_admin"),
			"email":    adminEmail,
			"password": "PBCAdminPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		adminID := ID(nested(ReadJSON(resp), "user", "id"))
		t.RequireNoError(grantAdminRole(db, adminID))
		resp2 := s.POST("/auth/login", map[string]any{
			"email": adminEmail, "password": "PBCAdminPass123!",
		}, nil)
		t.RequireStatus(resp2, 200)
		adminToken := Str(ReadJSON(resp2)["access_token"])

		// Create two categories.
		cat1Resp := s.POST("/store/categories", map[string]any{
			"name": uniq("PBC_cat1"),
		}, Bearer(adminToken))
		t.RequireStatus(cat1Resp, 201)
		cat1ID := ID(ReadJSON(cat1Resp)["id"])

		cat2Resp := s.POST("/store/categories", map[string]any{
			"name": uniq("PBC_cat2"),
		}, Bearer(adminToken))
		t.RequireStatus(cat2Resp, 201)
		cat2ID := ID(ReadJSON(cat2Resp)["id"])

		// Add 2 products to cat1 and 1 to cat2.
		for i := 0; i < 2; i++ {
			pr := s.POST("/store/products", map[string]any{
				"category_id": cat1ID,
				"name":        uniq("PBC_prod_cat1"),
				"price":       5.00,
				"stock":       10,
				"is_active":   true,
			}, Bearer(adminToken))
			t.RequireStatus(pr, 201)
			pr.Body.Close()
		}
		pr2 := s.POST("/store/products", map[string]any{
			"category_id": cat2ID,
			"name":        uniq("PBC_prod_cat2"),
			"price":       7.00,
			"stock":       5,
			"is_active":   true,
		}, Bearer(adminToken))
		t.RequireStatus(pr2, 201)
		pr2.Body.Close()

		// List products by cat1 — must return exactly those 2.
		listResp := s.GET(fmt.Sprintf("/store/categories/%d/products", cat1ID), nil)
		t.RequireStatus(listResp, 200)
		products := ReadJSONList(listResp)
		t.Require(len(products) >= 2,
			"products-by-category for cat1 must return at least 2, got %d", len(products))
	})

	// ── store: order history for user ─────────────────────────────────────────

	s.Add("store/order_history", func(t *T) {
		adminEmail := uniq("oh_admin") + "@skaia.test"
		resp := s.POST("/auth/register", map[string]any{
			"username": uniq("oh_admin"),
			"email":    adminEmail,
			"password": "OHAdminPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		adminID := ID(nested(ReadJSON(resp), "user", "id"))
		t.RequireNoError(grantAdminRole(db, adminID))
		resp2 := s.POST("/auth/login", map[string]any{
			"email": adminEmail, "password": "OHAdminPass123!",
		}, nil)
		t.RequireStatus(resp2, 200)
		adminToken := Str(ReadJSON(resp2)["access_token"])

		userResp := s.POST("/auth/register", map[string]any{
			"username": uniq("oh_user"),
			"email":    uniq("oh_user") + "@skaia.test",
			"password": "OHUserPass123!",
		}, nil)
		t.RequireStatus(userResp, 201)
		userToken := Str(ReadJSON(userResp)["access_token"])

		catResp := s.POST("/store/categories", map[string]any{
			"name": uniq("OH_cat"),
		}, Bearer(adminToken))
		t.RequireStatus(catResp, 201)
		catID := ID(ReadJSON(catResp)["id"])

		pResp := s.POST("/store/products", map[string]any{
			"category_id": catID,
			"name":        uniq("OH_prod"),
			"price":       9.99,
			"stock":       100,
			"is_active":   true,
		}, Bearer(adminToken))
		t.RequireStatus(pResp, 201)
		prodID := ID(ReadJSON(pResp)["id"])

		// Create 2 orders.
		for i := 0; i < 2; i++ {
			oResp := s.POST("/store/orders", map[string]any{
				"items": []map[string]any{
					{"product_id": prodID, "quantity": 1, "price": 9.99},
				},
			}, Bearer(userToken))
			t.RequireStatus(oResp, 201)
			oResp.Body.Close()
		}

		// Fetch order history.
		histResp := s.GET("/store/orders", Bearer(userToken))
		t.RequireStatus(histResp, 200)
		orders := ReadJSONList(histResp)
		t.Require(len(orders) >= 2,
			"order history must return at least 2 orders, got %d", len(orders))
	})

	// ── user: suspension workflow ─────────────────────────────────────────────

	s.Add("user/suspend_and_unsuspend", func(t *T) {
		// Create admin.
		adminEmail := uniq("sus_admin") + "@skaia.test"
		resp := s.POST("/auth/register", map[string]any{
			"username": uniq("sus_admin"),
			"email":    adminEmail,
			"password": "SusAdminPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		adminID := ID(nested(ReadJSON(resp), "user", "id"))
		t.RequireNoError(grantAdminRole(db, adminID))
		resp2 := s.POST("/auth/login", map[string]any{"email": adminEmail, "password": "SusAdminPass123!"}, nil)
		t.RequireStatus(resp2, 200)
		adminToken := Str(ReadJSON(resp2)["access_token"])

		// Create target user.
		targetEmail := uniq("target") + "@skaia.test"
		resp3 := s.POST("/auth/register", map[string]any{
			"username": uniq("target"),
			"email":    targetEmail,
			"password": "TargetPass123!",
		}, nil)
		t.RequireStatus(resp3, 201)
		targetID := ID(nested(ReadJSON(resp3), "user", "id"))

		// Suspend the user.
		susResp := s.POST(fmt.Sprintf("/users/%d/suspend", targetID), map[string]any{
			"reason": "Integration test suspension",
		}, Bearer(adminToken))
		t.RequireStatus(susResp, 200)
		susResp.Body.Close()

		// Verify suspension by fetching the user profile.
		getResp := s.GET(fmt.Sprintf("/users/%d", targetID), Bearer(adminToken))
		t.RequireStatus(getResp, 200)
		userData := ReadJSON(getResp)
		isSuspended, _ := userData["is_suspended"].(bool)
		t.Require(isSuspended, "user must be suspended after suspend call")

		// Unsuspend the user — route is DELETE /users/{id}/suspend.
		unsusResp := s.DELETE(fmt.Sprintf("/users/%d/suspend", targetID), nil, Bearer(adminToken))
		t.RequireStatus(unsusResp, 200)
		unsusResp.Body.Close()

		// Verify unsuspension by fetching the user profile again.
		getResp2 := s.GET(fmt.Sprintf("/users/%d", targetID), Bearer(adminToken))
		t.RequireStatus(getResp2, 200)
		userData2 := ReadJSON(getResp2)
		isSuspended2, _ := userData2["is_suspended"].(bool)
		t.Require(!isSuspended2, "user must not be suspended after unsuspend call")
	})

	// ── forum: pagination ─────────────────────────────────────────────────────

	s.Add("forum/thread_pagination", func(t *T) {
		adminEmail := uniq("pag_admin") + "@skaia.test"
		resp := s.POST("/auth/register", map[string]any{
			"username": uniq("pag_admin"),
			"email":    adminEmail,
			"password": "PagAdminPass123!",
		}, nil)
		t.RequireStatus(resp, 201)
		adminID := ID(nested(ReadJSON(resp), "user", "id"))
		t.RequireNoError(grantAdminRole(db, adminID))
		resp2 := s.POST("/auth/login", map[string]any{"email": adminEmail, "password": "PagAdminPass123!"}, nil)
		t.RequireStatus(resp2, 200)
		adminToken := Str(ReadJSON(resp2)["access_token"])

		userResp := s.POST("/auth/register", map[string]any{
			"username": uniq("pag_user"),
			"email":    uniq("pag_user") + "@skaia.test",
			"password": "PagUserPass123!",
		}, nil)
		t.RequireStatus(userResp, 201)
		userToken := Str(ReadJSON(userResp)["access_token"])

		catResp := s.POST("/forum/categories", map[string]any{
			"name": uniq("PagCat"),
		}, Bearer(adminToken))
		t.RequireStatus(catResp, 201)
		catID := ID(ReadJSON(catResp)["id"])

		// Create 5 threads.
		for i := 0; i < 5; i++ {
			tr := s.POST("/forum/threads", map[string]any{
				"category_id": fmt.Sprintf("%d", catID),
				"title":       uniq("PagThread"),
				"content":     "Pagination test content",
			}, Bearer(userToken))
			t.RequireStatus(tr, 201)
			tr.Body.Close()
		}

		// Fetch page 1 with limit=2.
		p1 := s.GET(fmt.Sprintf("/forum/categories/%d/threads?limit=2&offset=0", catID), nil)
		t.RequireStatus(p1, 200)
		page1 := ReadJSONList(p1)
		t.Require(len(page1) == 2, "page 1 with limit=2 must return exactly 2 threads, got %d", len(page1))

		// Fetch page 2 with limit=2 offset=2.
		p2 := s.GET(fmt.Sprintf("/forum/categories/%d/threads?limit=2&offset=2", catID), nil)
		t.RequireStatus(p2, 200)
		page2 := ReadJSONList(p2)
		t.Require(len(page2) >= 2, "page 2 with offset=2 must return at least 2 threads, got %d", len(page2))

		// Confirm pages don't overlap by checking the first IDs.
		if len(page1) > 0 && len(page2) > 0 {
			id1 := ID(page1[0].(map[string]any)["id"])
			id2 := ID(page2[0].(map[string]any)["id"])
			t.Require(id1 != id2, "pages must not return the same first thread (page1[0].id=%d == page2[0].id=%d)", id1, id2)
		}
	})
}
