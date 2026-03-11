package integration

import (
	"database/sql"
	"fmt"
)

// RegisterUserTests registers all user-domain integration tests onto s.
// Tests run sequentially and share admin/user state through closures.
func RegisterUserTests(s *Suite, db *sql.DB) {
	// ── shared state ──────────────────────────────────────────────────────────
	var (
		adminEmail    = uniq("admin") + "@skaia.test"
		adminUsername = uniq("admin")
		adminPassword = "AdminPass123!"
		adminToken    string
		adminID       int64

		userEmail    = uniq("user") + "@skaia.test"
		userUsername = uniq("user")
		userPassword = "UserPass123!"
		userToken    string
		userID       int64
	)

	// ── setup: create admin ───────────────────────────────────────────────────
	s.Add("user/setup_admin", func(t *T) {
		resp := s.POST("/api/auth/register", map[string]any{
			"username":     adminUsername,
			"email":        adminEmail,
			"password":     adminPassword,
			"display_name": "Integration Admin",
		}, nil)
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		adminID = ID(nested(data, "user", "id"))
		t.Require(adminID != 0, "admin user id must be non-zero")

		t.RequireNoError(grantAdminRole(db, adminID))

		// Re-login to receive a JWT that includes the admin role.
		resp2 := s.POST("/api/auth/login", map[string]any{
			"email":    adminEmail,
			"password": adminPassword,
		}, nil)
		t.RequireStatus(resp2, 200)
		data2 := ReadJSON(resp2)
		adminToken = Str(data2["access_token"])
		t.Require(adminToken != "", "admin token must be non-empty")
	})

	// ── user/register ─────────────────────────────────────────────────────────
	s.Add("user/register", func(t *T) {
		resp := s.POST("/api/auth/register", map[string]any{
			"username":     userUsername,
			"email":        userEmail,
			"password":     userPassword,
			"display_name": "Test User",
		}, nil)
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		userToken = Str(data["access_token"])
		userID = ID(nested(data, "user", "id"))
		t.Require(userToken != "", "access_token must be present")
		t.Require(userID != 0, "user id must be non-zero")
	})

	// ── user/login ────────────────────────────────────────────────────────────
	s.Add("user/login", func(t *T) {
		resp := s.POST("/api/auth/login", map[string]any{
			"email":    userEmail,
			"password": userPassword,
		}, nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		tok := Str(data["access_token"])
		t.Require(tok != "", "access_token must be present on login")
		userToken = tok // refresh token in case register gave a different one
	})

	// ── user/login_wrong_password ─────────────────────────────────────────────
	s.Add("user/login_wrong_password", func(t *T) {
		resp := s.POST("/api/auth/login", map[string]any{
			"email":    userEmail,
			"password": "WrongPass999!",
		}, nil)
		t.Require(resp.StatusCode >= 400, "wrong password must return 4xx, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── user/get_by_id ────────────────────────────────────────────────────────
	s.Add("user/get_by_id", func(t *T) {
		resp := s.GET(fmt.Sprintf("/users/%d", userID), Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.AssertEqual(Str(data["username"]), userUsername, "username")
		t.Require(Str(data["password_hash"]) == "", "password_hash must not be exposed")
	})

	// ── user/get_profile ──────────────────────────────────────────────────────
	s.Add("user/get_profile", func(t *T) {
		resp := s.GET("/api/users/profile", Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.AssertEqual(Str(data["email"]), userEmail, "email")
	})

	// ── user/update ───────────────────────────────────────────────────────────
	s.Add("user/update_display_name", func(t *T) {
		newName := uniq("DisplayName")
		resp := s.PUT(fmt.Sprintf("/api/users/%d", userID), map[string]any{
			"display_name": newName,
			"bio":          "Integration test bio",
		}, Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.AssertEqual(Str(data["display_name"]), newName, "display_name after update")
		t.AssertEqual(Str(data["bio"]), "Integration test bio", "bio after update")
	})

	// ── user/update_verify_persistence ───────────────────────────────────────
	s.Add("user/update_verify_persistence", func(t *T) {
		// Fetch the user again to confirm the mutation persisted in the DB.
		resp := s.GET(fmt.Sprintf("/users/%d", userID), Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.Require(Str(data["bio"]) == "Integration test bio", "bio must persist in DB")
	})

	// ── user/search ───────────────────────────────────────────────────────────
	s.Add("user/search", func(t *T) {
		resp := s.GET("/users/search?q="+userUsername, Bearer(userToken))
		t.RequireStatus(resp, 200)
		list := ReadJSONList(resp)
		t.Require(len(list) >= 1, "search must return at least 1 result")
	})

	// ── user/add_permission ───────────────────────────────────────────────────
	s.Add("user/add_permission", func(t *T) {
		resp := s.POST(fmt.Sprintf("/users/%d/permissions", userID), map[string]any{
			"permission": "forums.test",
		}, Bearer(adminToken))
		t.RequireStatus(resp, 200)
	})

	// ── user/remove_permission ────────────────────────────────────────────────
	s.Add("user/remove_permission", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/users/%d/permissions/forums.test", userID), nil, Bearer(adminToken))
		t.RequireStatus(resp, 200)
	})
}

// nested safely traverses a JSON map using dot-notation keys.
// e.g. nested(data, "user", "id") returns data["user"]["id"]
func nested(m map[string]any, keys ...string) any {
	var v any = m
	for _, k := range keys {
		if sub, ok := v.(map[string]any); ok {
			v = sub[k]
		} else {
			return nil
		}
	}
	return v
}
