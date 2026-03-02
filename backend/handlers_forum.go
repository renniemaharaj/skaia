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

		// Broadcast deletion to ALL clients (same as create) so any client
		// showing the forum page removes the category, regardless of subscription state
		appCtx.WebSocketHub.Broadcast(&websocket.Message{
			Type: websocket.ForumUpdate,
			Payload: json.RawMessage(func() []byte {
				data, _ := json.Marshal(map[string]interface{}{
					"action": "category_deleted",
					"id":     id,
				})
				return data
			}()),
		})

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

		// Get current user info if authenticated
		var currentUserID int64 = 0
		var claims *auth.Claims
		if c, ok := r.Context().Value("claims").(*auth.Claims); ok {
			currentUserID = c.UserID
			claims = c
		}

		thread, err := appCtx.ForumThreadRepo.GetThreadByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "thread not found"})
			return
		}

		// Increment view count
		appCtx.ForumThreadRepo.IncrementViewCount(id)

		// Check if user liked this thread
		if currentUserID > 0 {
			isLiked, err := appCtx.ForumThreadRepo.IsThreadLikedByUser(id, currentUserID)
			if err == nil {
				thread.IsLiked = isLiked
			}
		}

		// Set thread permissions
		if claims != nil {
			thread.CanLikeComments = hasPermission(claims, "thread.canLikeComments")
			thread.CanDeleteThreadComment = hasPermission(claims, "forum.delete-post")
			thread.CanLikeThreads = hasPermission(claims, "thread.canLikeThreads")
			thread.CanEdit = currentUserID == thread.UserID || hasPermission(claims, "forum.edit-thread")
			thread.CanDelete = currentUserID == thread.UserID || hasPermission(claims, "forum.delete-thread")
		} else {
			thread.CanEdit = false
			thread.CanDelete = false
		}

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
			// Check for forum.edit-thread permission (admins/mods)
			hasEditPerm := false
			for _, perm := range claims.Permissions {
				if perm == "forum.edit-thread" {
					hasEditPerm = true
					break
				}
			}
			if !hasEditPerm {
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
			// Check for forum.delete-thread permission (admins/mods)
			hasDeletePerm := false
			for _, perm := range claims.Permissions {
				if perm == "forum.delete-thread" {
					hasDeletePerm = true
					break
				}
			}
			if !hasDeletePerm {
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

// handleThreadCommentsList gets all comments in a thread
func handleThreadCommentsList(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		threadID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		// Get current user info if authenticated
		var currentUserID int64 = 0
		var claims *auth.Claims
		if c, ok := r.Context().Value("claims").(*auth.Claims); ok {
			currentUserID = c.UserID
			claims = c
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

		comments, err := appCtx.ThreadCommentRepo.GetThreadComments(id, limit, offset)
		if err != nil {
			log.Printf("Error fetching comments: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to fetch comments"})
			return
		}

		// Enrich comments with like and permission info
		for _, comment := range comments {
			// Check if user liked this comment
			if currentUserID > 0 {
				isLiked, err := appCtx.ThreadCommentRepo.IsThreadCommentLikedByUser(comment.ID, currentUserID)
				if err == nil {
					comment.IsLiked = isLiked
				}
			}

			// Set permissions based on user claims
			if claims != nil {
				comment.CanLikeComments = hasPermission(claims, "thread.canLikeComments")
				// can_delete: owns comment OR has explicit delete-any permission (admin/mod only)
				comment.CanDelete = currentUserID == comment.UserID || hasPermission(claims, "forum.delete-post")
				// can_edit: owns comment OR has explicit edit-any permission (admin/mod only)
				comment.CanEdit = currentUserID == comment.UserID || hasPermission(claims, "forum.edit-post")
			} else {
				// Unauthenticated: no delete/edit rights
				comment.CanDelete = false
				comment.CanEdit = false
			}
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(comments)
	}
}

// handleThreadCommentCreate creates a new thread comment
func handleThreadCommentCreate(appCtx *AppContext) http.HandlerFunc {
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

		comment := &models.ThreadComment{
			ThreadID: id,
			UserID:   claims.UserID,
			Content:  req.Content,
		}

		created, err := appCtx.ThreadCommentRepo.CreateThreadComment(comment)
		if err != nil {
			log.Printf("Error creating comment: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to create comment"})
			return
		}

		// Fetch the comment with user information before sending
		createdWithUserInfo, err := appCtx.ThreadCommentRepo.GetThreadCommentByID(created.ID)
		if err == nil {
			created = createdWithUserInfo
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(id, map[string]interface{}{
			"new_comment": created,
		}, "comment_created")

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)
	}
}

// handleThreadCommentUpdate updates a thread comment
func handleThreadCommentUpdate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum post updated",
			Status:  "success",
		})
	}
}

// handleThreadCommentDelete deletes a thread comment
func handleThreadCommentDelete(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		commentID := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(commentID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid comment ID"})
			return
		}

		// Get comment to check ownership
		comment, err := appCtx.ThreadCommentRepo.GetThreadCommentByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "comment not found"})
			return
		}

		// Check if user owns the comment or has permission
		if comment.UserID != claims.UserID {
			hasDeletePerm := false
			for _, perm := range claims.Permissions {
				if perm == "forum.delete-post" || perm == "thread.canDeleteThreadComment" {
					hasDeletePerm = true
					break
				}
			}
			if !hasDeletePerm {
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "insufficient permissions"})
				return
			}
		}

		if err := appCtx.ThreadCommentRepo.DeleteThreadComment(id); err != nil {
			log.Printf("Error deleting comment: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to delete comment"})
			return
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(comment.ThreadID, map[string]interface{}{
			"comment_id": id,
		}, "comment_deleted")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
	}
}

// handleThreadCommentLike likes a thread comment
func handleThreadCommentLike(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		commentID := chi.URLParam(r, "commentId")
		id, err := strconv.ParseInt(commentID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid comment ID"})
			return
		}

		// Get comment to find thread ID
		comment, err := appCtx.ThreadCommentRepo.GetThreadCommentByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "comment not found"})
			return
		}

		// Like the comment
		likeCount, err := appCtx.ThreadCommentRepo.LikeThreadComment(id, claims.UserID)
		if err != nil {
			log.Printf("Error liking comment: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to like comment"})
			return
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(comment.ThreadID, map[string]interface{}{
			"comment_id": id,
			"likes":      likeCount,
			"user_id":    claims.UserID,
		}, "comment_liked")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "liked",
			"likes":  likeCount,
		})
	}
}

// handleThreadCommentUnlike unlikes a thread comment
func handleThreadCommentUnlike(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		commentID := chi.URLParam(r, "commentId")
		id, err := strconv.ParseInt(commentID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid comment ID"})
			return
		}

		// Get comment to find thread ID
		comment, err := appCtx.ThreadCommentRepo.GetThreadCommentByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "comment not found"})
			return
		}

		// Unlike the comment
		likeCount, err := appCtx.ThreadCommentRepo.UnlikeThreadComment(id, claims.UserID)
		if err != nil {
			log.Printf("Error unliking comment: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to unlike comment"})
			return
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(comment.ThreadID, map[string]interface{}{
			"comment_id": id,
			"likes":      likeCount,
			"user_id":    claims.UserID,
		}, "comment_unliked")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unliked",
			"likes":  likeCount,
		})
	}
}

// handleForumThreadLike likes a forum thread
func handleForumThreadLike(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		threadID := chi.URLParam(r, "threadId")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		// Get thread to verify it exists
		_, err = appCtx.ForumThreadRepo.GetThreadByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "thread not found"})
			return
		}

		// Like the thread
		likeCount, err := appCtx.ForumThreadRepo.LikeThread(id, claims.UserID)
		if err != nil {
			log.Printf("Error liking thread: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to like thread"})
			return
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(id, map[string]interface{}{
			"thread_id": id,
			"likes":     likeCount,
			"user_id":   claims.UserID,
		}, "thread_liked")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "liked",
			"likes":  likeCount,
		})
	}
}

// handleForumThreadUnlike unlikes a forum thread
func handleForumThreadUnlike(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value("claims").(*auth.Claims)
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		threadID := chi.URLParam(r, "threadId")
		id, err := strconv.ParseInt(threadID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid thread ID"})
			return
		}

		// Get thread to verify it exists
		_, err = appCtx.ForumThreadRepo.GetThreadByID(id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "thread not found"})
			return
		}

		// Unlike the thread
		likeCount, err := appCtx.ForumThreadRepo.UnlikeThread(id, claims.UserID)
		if err != nil {
			log.Printf("Error unliking thread: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "failed to unlike thread"})
			return
		}

		// Propagate to clients subscribed to this thread
		appCtx.WebSocketHub.PropagateForumThread(id, map[string]interface{}{
			"thread_id": id,
			"likes":     likeCount,
			"user_id":   claims.UserID,
		}, "thread_unliked")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unliked",
			"likes":  likeCount,
		})
	}
}
