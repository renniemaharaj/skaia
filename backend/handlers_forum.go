package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/auth"
	"github.com/skaia/backend/models"
	"github.com/skaia/backend/websocket"
)

// handleForumCategories fetches all forum categories with their recent threads
func handleForumCategories(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		categories, err := appCtx.ForumCategoryRepo.ListCategories()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Fetch recent threads for each category
		type CategoryWithThreads struct {
			*models.ForumCategory
			Threads []*models.ForumThread `json:"threads"`
		}

		var response []*CategoryWithThreads
		for _, category := range categories {
			threads, err := appCtx.ForumThreadRepo.GetCategoryThreads(category.ID, 2, 0)
			if err != nil {
				threads = []*models.ForumThread{}
			}
			response = append(response, &CategoryWithThreads{
				ForumCategory: category,
				Threads:       threads,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// handleForumCategoryCreate creates a new forum category
func handleForumCategoryCreate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Check permission
		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Check for forums.createCategory permission
		hasPermission := false
		for _, perm := range claims.Permissions {
			if perm == "forums.createCategory" {
				hasPermission = true
				break
			}
		}

		if !hasPermission {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
			return
		}

		var req struct {
			Name         string `json:"name"`
			Description  string `json:"description"`
			DisplayOrder int    `json:"display_order"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		if req.Name == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "category name required"})
			return
		}

		category := &models.ForumCategory{
			Name:         req.Name,
			Description:  req.Description,
			DisplayOrder: req.DisplayOrder,
		}

		created, err := appCtx.ForumCategoryRepo.CreateCategory(category)
		if err != nil {
			log.Printf("Error creating category: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to create category"})
			return
		}

		// Broadcast to all clients
		appCtx.WebSocketHub.Broadcast(&websocket.Message{
			Type: websocket.ForumUpdate,
			Payload: json.RawMessage(func() []byte {
				data, _ := json.Marshal(map[string]interface{}{
					"action": "category_created",
					"data":   created,
				})
				return data
			}()),
		})

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)
	}
}

// handleForumCategoryDelete deletes a forum category
func handleForumCategoryDelete(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		// Check for forums.deleteCategory permission
		hasPermission := false
		for _, perm := range claims.Permissions {
			if perm == "forums.deleteCategory" {
				hasPermission = true
				break
			}
		}

		if !hasPermission {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
			return
		}

		categoryID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(categoryID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid category ID"})
			return
		}

		if err := appCtx.ForumCategoryRepo.DeleteCategory(id); err != nil {
			log.Printf("Error deleting category: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to delete category"})
			return
		}

		// Propagate deletion to all clients subscribed to this category
		appCtx.WebSocketHub.PropagateForumCategories(id, nil, "category_deleted")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// handleForumThreadsList gets threads (unused - categories handle thread listing)
func handleForumThreadsList(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"threads": []interface{}{}})
	}
}

// handleForumThreadCreate creates a new forum thread
func handleForumThreadCreate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		var req struct {
			CategoryID string `json:"category_id"`
			Title      string `json:"title"`
			Content    string `json:"content"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		if req.Title == "" || req.Content == "" || req.CategoryID == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "title, content, and category_id required"})
			return
		}

		categoryID, err := strconv.ParseInt(req.CategoryID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid category ID"})
			return
		}

		thread := &models.ForumThread{
			CategoryID: categoryID,
			UserID:     claims.UserID,
			Title:      req.Title,
			Content:    req.Content,
		}

		created, err := appCtx.ForumThreadRepo.CreateThread(thread)
		if err != nil {
			log.Printf("Error creating thread: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to create thread"})
			return
		}

		// Broadcast to all WebSocket subscribers (for general awareness)
		appCtx.WebSocketHub.Broadcast(&websocket.Message{
			Type: websocket.ForumUpdate,
			Payload: json.RawMessage(func() []byte {
				data, _ := json.Marshal(map[string]interface{}{
					"action": "thread_created",
					"data":   created,
				})
				return data
			}()),
		})

		// Propagate to thread subscribers
		appCtx.WebSocketHub.PropagateForumThread(created.ID, created, "thread_created")

		// Get 2 most recent threads in the category and propagate to category subscribers
		recentThreads, err := appCtx.ForumThreadRepo.GetCategoryThreads(categoryID, 2, 0)
		if err != nil {
			log.Printf("Error fetching recent threads: %v", err)
		}
		if len(recentThreads) > 0 {
			appCtx.WebSocketHub.PropagateForumCategories(categoryID, map[string]interface{}{
				"threads": recentThreads,
			}, "category_threads_updated")
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)
	}
}

// handleForumThreadGet fetches a single thread
func handleForumThreadGet(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		threadID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		thread, err := appCtx.ForumThreadRepo.GetThreadByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "thread not found"})
			return
		}

		// Increment view count
		appCtx.ForumThreadRepo.IncrementViewCount(id)

		json.NewEncoder(w).Encode(thread)
	}
}

// handleForumThreadUpdate updates a forum thread
func handleForumThreadUpdate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		threadID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		// Check if user owns the thread or has permission
		thread, err := appCtx.ForumThreadRepo.GetThreadByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "thread not found"})
			return
		}

		if thread.UserID != claims.UserID {
			// Check for forums.editAny permission
			hasPermission := false
			for _, perm := range claims.Permissions {
				if perm == "forums.editAny" {
					hasPermission = true
					break
				}
			}
			if !hasPermission {
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
				return
			}
		}

		var req struct {
			Title   string `json:"title"`
			Content string `json:"content"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		thread.Title = req.Title
		thread.Content = req.Content

		updated, err := appCtx.ForumThreadRepo.UpdateThread(thread)
		if err != nil {
			log.Printf("Error updating thread: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to update thread"})
			return
		}

		// Propagate to clients subscribed to this specific thread
		appCtx.WebSocketHub.PropagateForumThread(id, updated, "thread_updated")

		// Propagate updated thread snapshot to category subscribers
		recentThreads, err := appCtx.ForumThreadRepo.GetCategoryThreads(thread.CategoryID, 2, 0)
		if err != nil {
			log.Printf("Error fetching recent threads: %v", err)
		}
		if len(recentThreads) > 0 {
			appCtx.WebSocketHub.PropagateForumCategories(thread.CategoryID, map[string]interface{}{
				"threads": recentThreads,
			}, "category_threads_updated")
		}

		json.NewEncoder(w).Encode(updated)
	}
}

// handleForumThreadDelete deletes a forum thread
func handleForumThreadDelete(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		threadID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		// Check if user owns the thread or has permission
		thread, err := appCtx.ForumThreadRepo.GetThreadByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "thread not found"})
			return
		}

		if thread.UserID != claims.UserID {
			// Check for forums.deleteAny permission
			hasPermission := false
			for _, perm := range claims.Permissions {
				if perm == "forums.deleteAny" {
					hasPermission = true
					break
				}
			}
			if !hasPermission {
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
				return
			}
		}

		if err := appCtx.ForumThreadRepo.DeleteThread(id); err != nil {
			log.Printf("Error deleting thread: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to delete thread"})
			return
		}

		// Propagate to clients subscribed to this specific thread
		appCtx.WebSocketHub.PropagateForumThread(id, nil, "thread_deleted")

		// Broadcast deletion to all clients for awareness
		appCtx.WebSocketHub.Broadcast(&websocket.Message{
			Type: websocket.ForumUpdate,
			Payload: json.RawMessage(func() []byte {
				data, _ := json.Marshal(map[string]interface{}{
					"action": "thread_deleted",
					"id":     id,
				})
				return data
			}()),
		})

		// Get updated thread snapshot for the category and propagate
		recentThreads, err := appCtx.ForumThreadRepo.GetCategoryThreads(thread.CategoryID, 2, 0)
		if err != nil {
			log.Printf("Error fetching recent threads: %v", err)
		}
		// Always propagate, even if empty (signals to client the category has 0 threads)
		appCtx.WebSocketHub.PropagateForumCategories(thread.CategoryID, map[string]interface{}{
			"threads": recentThreads,
		}, "category_threads_updated")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// handleForumPostsList gets all posts in a thread
func handleForumPostsList(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		threadID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		// Get query parameters for pagination
		limit := 50
		offset := 0
		if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
			if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
				limit = l
			}
		}
		if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
			if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
				offset = o
			}
		}

		posts, err := appCtx.ForumPostRepo.GetThreadPosts(id, limit, offset)
		if err != nil {
			log.Printf("Error fetching posts: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to fetch posts"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(posts)
	}
}

// handleForumPostCreate creates a new forum post
func handleForumPostCreate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		threadID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		var req struct {
			Content string `json:"content"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
			return
		}

		if req.Content == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "content required"})
			return
		}

		post := &models.ForumPost{
			ThreadID: id,
			UserID:   claims.UserID,
			Content:  req.Content,
		}

		created, err := appCtx.ForumPostRepo.CreatePost(post)
		if err != nil {
			log.Printf("Error creating post: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to create post"})
			return
		}

		// Fetch the post with user information before sending
		createdWithUserInfo, err := appCtx.ForumPostRepo.GetPostByID(created.ID)
		if err == nil {
			created = createdWithUserInfo
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(id, map[string]interface{}{
			"new_post": created,
		}, "post_created")

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)
	}
}

// handleForumPostUpdate updates a forum post
func handleForumPostUpdate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum post updated",
			Status:  "success",
		})
	}
}

// handleForumPostDelete deletes a forum post
func handleForumPostDelete(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		postID := chi.URLParam(r, "postId")
		id, err := strconv.ParseInt(postID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid post ID"})
			return
		}

		// Get post to check ownership
		post, err := appCtx.ForumPostRepo.GetPostByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "post not found"})
			return
		}

		// Check if user owns the post or has permission
		if post.UserID != claims.UserID {
			hasPermission := false
			for _, perm := range claims.Permissions {
				if perm == "forums.deleteAny" {
					hasPermission = true
					break
				}
			}
			if !hasPermission {
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
				return
			}
		}

		if err := appCtx.ForumPostRepo.DeletePost(id); err != nil {
			log.Printf("Error deleting post: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to delete post"})
			return
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(post.ThreadID, map[string]interface{}{
			"post_id": id,
		}, "post_deleted")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}
