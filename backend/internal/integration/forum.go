package integration

import (
	"database/sql"
	"fmt"
)

// RegisterForumTests registers all forum-domain integration tests onto s.
func RegisterForumTests(s *Suite, db *sql.DB) {
	// ── shared state ──────────────────────────────────────────────────────────
	var (
		adminEmail    = uniq("fadmin") + "@skaia.test"
		adminUsername = uniq("fadmin")
		adminPassword = "FAdminPass123!"
		adminToken    string

		userEmail    = uniq("fuser") + "@skaia.test"
		userUsername = uniq("fuser")
		userPassword = "FUserPass123!"
		userToken    string

		categoryID int64
		threadID   int64
		commentID  int64
	)

	// ── setup ─────────────────────────────────────────────────────────────────
	s.Add("forum/setup", func(t *T) {
		// Create admin
		resp := s.POST("/auth/register", map[string]any{
			"username": adminUsername,
			"email":    adminEmail,
			"password": adminPassword,
		}, nil)
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		adminID := ID(nested(data, "user", "id"))
		t.Require(adminID != 0, "admin user id must be non-zero")
		t.RequireNoError(grantAdminRole(db, adminID))

		resp2 := s.POST("/auth/login", map[string]any{
			"email": adminEmail, "password": adminPassword,
		}, nil)
		t.RequireStatus(resp2, 200)
		adminToken = Str(ReadJSON(resp2)["access_token"])
		t.Require(adminToken != "", "admin token must be non-empty")

		// Create regular user
		resp3 := s.POST("/auth/register", map[string]any{
			"username": userUsername,
			"email":    userEmail,
			"password": userPassword,
		}, nil)
		t.RequireStatus(resp3, 201)
		userToken = Str(ReadJSON(resp3)["access_token"])
		t.Require(userToken != "", "user token must be non-empty")
	})

	// ── forum/create_category ─────────────────────────────────────────────────
	s.Add("forum/create_category", func(t *T) {
		resp := s.POST("/forum/categories", map[string]any{
			"name":        uniq("TestCategory"),
			"description": "An integration test category",
		}, Bearer(adminToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		categoryID = ID(data["id"])
		t.Require(categoryID != 0, "created category must have an id")
	})

	// ── forum/create_category_requires_admin ──────────────────────────────────
	s.Add("forum/create_category_requires_admin", func(t *T) {
		resp := s.POST("/forum/categories", map[string]any{
			"name": uniq("NoPerms"),
		}, Bearer(userToken))
		t.Require(resp.StatusCode == 403, "non-admin must get 403, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── forum/list_categories ─────────────────────────────────────────────────
	s.Add("forum/list_categories", func(t *T) {
		resp := s.GET("/forum/categories", nil)
		t.RequireStatus(resp, 200)
		list := ReadJSONList(resp)
		t.Require(len(list) >= 1, "must return at least the created category")
	})

	// ── forum/create_thread ───────────────────────────────────────────────────
	s.Add("forum/create_thread", func(t *T) {
		resp := s.POST("/forum/threads", map[string]any{
			"category_id": fmt.Sprintf("%d", categoryID), // string per handler
			"title":       uniq("IntegrationThread"),
			"content":     "This thread was created by the integration test suite.",
		}, Bearer(userToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		threadID = ID(data["id"])
		t.Require(threadID != 0, "created thread must have an id")
	})

	// ── forum/get_thread ──────────────────────────────────────────────────────
	s.Add("forum/get_thread", func(t *T) {
		resp := s.GET(fmt.Sprintf("/forum/threads/%d", threadID), nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.Require(ID(data["id"]) == threadID, "fetched thread id must match")
		t.Require(Str(data["content"]) != "", "thread content must be non-empty")
	})

	// ── forum/update_thread ───────────────────────────────────────────────────
	s.Add("forum/update_thread", func(t *T) {
		updatedTitle := uniq("UpdatedTitle")
		resp := s.PUT(fmt.Sprintf("/forum/threads/%d", threadID), map[string]any{
			"title":   updatedTitle,
			"content": "Updated content from integration tests.",
		}, Bearer(userToken))
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.AssertEqual(Str(data["title"]), updatedTitle, "title after update")
	})

	// ── forum/update_verify_persistence ──────────────────────────────────────
	s.Add("forum/update_verify_persistence", func(t *T) {
		resp := s.GET(fmt.Sprintf("/forum/threads/%d", threadID), nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		t.Require(Str(data["content"]) == "Updated content from integration tests.",
			"updated content must persist in DB")
	})

	// ── forum/like_thread ─────────────────────────────────────────────────────
	s.Add("forum/like_thread", func(t *T) {
		resp := s.POST(fmt.Sprintf("/forum/threads/%d/like", threadID), nil, Bearer(userToken))
		t.RequireStatus(resp, 200)
	})

	// ── forum/like_thread_duplicate ───────────────────────────────────────────
	s.Add("forum/like_thread_duplicate", func(t *T) {
		// Like uses ON CONFLICT DO NOTHING, so a duplicate is idempotent — 200 is correct.
		resp := s.POST(fmt.Sprintf("/forum/threads/%d/like", threadID), nil, Bearer(userToken))
		t.RequireStatus(resp, 200)
		resp.Body.Close()
	})

	// ── forum/unlike_thread ───────────────────────────────────────────────────
	s.Add("forum/unlike_thread", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/forum/threads/%d/like", threadID), nil, Bearer(userToken))
		t.RequireStatus(resp, 200)
	})

	// ── forum/create_comment ──────────────────────────────────────────────────
	s.Add("forum/create_comment", func(t *T) {
		resp := s.POST(fmt.Sprintf("/forum/threads/%d/comments", threadID), map[string]any{
			"content": "This is an integration test comment.",
		}, Bearer(userToken))
		t.RequireStatus(resp, 201)
		data := ReadJSON(resp)
		commentID = ID(data["id"])
		t.Require(commentID != 0, "created comment must have an id")
	})

	// ── forum/comment_increments_reply_count ──────────────────────────────────
	s.Add("forum/comment_increments_reply_count", func(t *T) {
		resp := s.GET(fmt.Sprintf("/forum/threads/%d", threadID), nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		rc := ID(data["reply_count"])
		t.Require(rc >= 1, "reply_count must be at least 1 after comment, got %d", rc)
	})

	// ── forum/like_comment ────────────────────────────────────────────────────
	s.Add("forum/like_comment", func(t *T) {
		resp := s.POST(fmt.Sprintf("/forum/comments/%d/like", commentID), nil, Bearer(userToken))
		t.RequireStatus(resp, 200)
	})

	// ── forum/unlike_comment ──────────────────────────────────────────────────
	s.Add("forum/unlike_comment", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/forum/comments/%d/like", commentID), nil, Bearer(userToken))
		t.RequireStatus(resp, 200)
	})

	// ── forum/delete_comment ──────────────────────────────────────────────────
	s.Add("forum/delete_comment", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/forum/comments/%d", commentID), nil, Bearer(userToken))
		t.RequireStatus(resp, 200)
	})

	// ── forum/delete_decrements_reply_count ───────────────────────────────────
	s.Add("forum/delete_decrements_reply_count", func(t *T) {
		resp := s.GET(fmt.Sprintf("/forum/threads/%d", threadID), nil)
		t.RequireStatus(resp, 200)
		data := ReadJSON(resp)
		rc := ID(data["reply_count"])
		t.Require(rc == 0, "reply_count must be 0 after comment deletion, got %d", rc)
	})

	// ── forum/delete_thread ───────────────────────────────────────────────────
	s.Add("forum/delete_thread", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/forum/threads/%d", threadID), nil, Bearer(userToken))
		t.RequireStatus(resp, 200)
	})

	// ── forum/delete_thread_verify_gone ──────────────────────────────────────
	s.Add("forum/delete_thread_verify_gone", func(t *T) {
		resp := s.GET(fmt.Sprintf("/forum/threads/%d", threadID), nil)
		t.Require(resp.StatusCode == 404 || resp.StatusCode == 410,
			"deleted thread must return 404/410, got %d", resp.StatusCode)
		resp.Body.Close()
	})

	// ── forum/delete_category ─────────────────────────────────────────────────
	s.Add("forum/delete_category", func(t *T) {
		resp := s.DELETE(fmt.Sprintf("/forum/categories/%d", categoryID), nil, Bearer(adminToken))
		t.RequireStatus(resp, 200)
	})
}
