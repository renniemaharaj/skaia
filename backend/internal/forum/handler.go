package forum

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	ws "github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// Handler exposes all forum HTTP endpoints.
type Handler struct {
	svc *Service
	hub *ws.Hub
}

// NewHandler creates a Handler.
func NewHandler(svc *Service, hub *ws.Hub) *Handler {
	return &Handler{svc: svc, hub: hub}
}

// Mount registers all forum routes on r.
func (h *Handler) Mount(r chi.Router, jwt, optJWT func(http.Handler) http.Handler) {
	r.Route("/forum", func(r chi.Router) {
		// Category routes
		r.With(optJWT).Get("/categories", h.listCategories)
		r.With(jwt).Post("/categories", h.createCategory)
		r.With(jwt).Delete("/categories/{id}", h.deleteCategory)

		// Thread routes
		r.With(optJWT).Get("/threads", h.listThreads)
		r.With(jwt).Post("/threads", h.createThread)
		r.With(optJWT).Get("/threads/{id}", h.getThread)
		r.With(jwt).Put("/threads/{id}", h.updateThread)
		r.With(jwt).Delete("/threads/{id}", h.deleteThread)
		r.With(jwt).Post("/threads/{threadId}/like", h.likeThread)
		r.With(jwt).Delete("/threads/{threadId}/like", h.unlikeThread)

		// Comment routes
		r.With(optJWT).Get("/threads/{id}/comments", h.listComments)
		r.With(jwt).Post("/threads/{id}/comments", h.createComment)
		r.With(jwt).Put("/comments/{id}", h.updateComment)
		r.With(jwt).Delete("/comments/{id}", h.deleteComment)
		r.With(jwt).Post("/comments/{commentId}/like", h.likeComment)
		r.With(jwt).Delete("/comments/{commentId}/like", h.unlikeComment)
	})
}

// parseID parses a chi URL parameter as int64.
func (h *Handler) parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

// Category handlers

func (h *Handler) listCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.svc.ListCategories()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type CategoryWithThreads struct {
		*models.ForumCategory
		Threads []*models.ForumThread `json:"threads"`
	}

	var out []*CategoryWithThreads
	for _, cat := range categories {
		threads, err := h.svc.ListCategoryThreads(cat.ID, 2, 0)
		if err != nil {
			threads = []*models.ForumThread{}
		}
		out = append(out, &CategoryWithThreads{ForumCategory: cat, Threads: threads})
	}
	WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !HasClaim(claims, "forums.createCategory") {
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

	created, err := h.svc.CreateCategory(&models.ForumCategory{
		Name:         req.Name,
		Description:  req.Description,
		DisplayOrder: req.DisplayOrder,
	})
	if err != nil {
		log.Printf("forum.createCategory: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to create category")
		return
	}

	h.hub.Broadcast(&ws.Message{
		Type: ws.ForumUpdate,
		Payload: marshalPayload(map[string]interface{}{
			"action": "category_created",
			"data":   created,
		}),
	})
	WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !HasClaim(claims, "forums.deleteCategory") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}

	if err := h.svc.DeleteCategory(id); err != nil {
		log.Printf("forum.deleteCategory: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}

	h.hub.Broadcast(&ws.Message{
		Type: ws.ForumUpdate,
		Payload: marshalPayload(map[string]interface{}{
			"action": "category_deleted",
			"id":     id,
		}),
	})
	WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Thread handlers

func (h *Handler) listThreads(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]interface{}{"threads": []interface{}{}})
}

func (h *Handler) createThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		CategoryID string `json:"category_id"`
		Title      string `json:"title"`
		Content    string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" || req.Content == "" || req.CategoryID == "" {
		WriteError(w, http.StatusBadRequest, "title, content, and category_id required")
		return
	}

	categoryID, err := strconv.ParseInt(req.CategoryID, 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}

	created, err := h.svc.CreateThread(&models.ForumThread{
		CategoryID: categoryID,
		UserID:     claims.UserID,
		Title:      req.Title,
		Content:    req.Content,
	})
	if err != nil {
		log.Printf("forum.createThread: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to create thread")
		return
	}

	h.hub.Broadcast(&ws.Message{
		Type: ws.ForumUpdate,
		Payload: marshalPayload(map[string]interface{}{
			"action": "thread_created",
			"data":   created,
		}),
	})
	h.hub.PropagateForumThread(created.ID, created, "thread_created")

	if recentThreads, err := h.svc.ListCategoryThreads(categoryID, 2, 0); err == nil && len(recentThreads) > 0 {
		h.hub.PropagateForumCategories(categoryID, map[string]interface{}{"threads": recentThreads}, "category_threads_updated")
	}

	WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) getThread(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	thread, err := h.svc.GetThread(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	_ = h.svc.IncrementViewCount(id)

	var userID int64
	claims, hasClaims := ClaimsFromCtx(r)
	if hasClaims {
		userID = claims.UserID
	}

	if userID > 0 {
		if isLiked, err := h.svc.IsThreadLikedByUser(id, userID); err == nil {
			thread.IsLiked = isLiked
		}
	}

	if hasClaims {
		thread.CanLikeComments = HasClaim(claims, "thread.canLikeComments")
		thread.CanDeleteThreadComment = HasClaim(claims, "forum.delete-post")
		thread.CanLikeThreads = HasClaim(claims, "thread.canLikeThreads")
		thread.CanEdit = userID == thread.UserID || HasClaim(claims, "forum.edit-thread")
		thread.CanDelete = userID == thread.UserID || HasClaim(claims, "forum.delete-thread")
	}

	WriteJSON(w, http.StatusOK, thread)
}

func (h *Handler) updateThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	thread, err := h.svc.GetThread(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	if thread.UserID != claims.UserID && !HasClaim(claims, "forum.edit-thread") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	thread.Title = req.Title
	thread.Content = req.Content

	updated, err := h.svc.UpdateThread(thread)
	if err != nil {
		log.Printf("forum.updateThread: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to update thread")
		return
	}

	h.hub.PropagateForumThread(id, updated, "thread_updated")

	if recentThreads, err := h.svc.ListCategoryThreads(thread.CategoryID, 2, 0); err == nil && len(recentThreads) > 0 {
		h.hub.PropagateForumCategories(thread.CategoryID, map[string]interface{}{"threads": recentThreads}, "category_threads_updated")
	}

	WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	thread, err := h.svc.GetThread(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	if thread.UserID != claims.UserID && !HasClaim(claims, "forum.delete-thread") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	if err := h.svc.DeleteThread(id); err != nil {
		log.Printf("forum.deleteThread: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete thread")
		return
	}

	h.hub.PropagateForumThread(id, nil, "thread_deleted")
	h.hub.Broadcast(&ws.Message{
		Type: ws.ForumUpdate,
		Payload: marshalPayload(map[string]interface{}{
			"action": "thread_deleted",
			"id":     id,
		}),
	})

	recentThreads, _ := h.svc.ListCategoryThreads(thread.CategoryID, 2, 0)
	h.hub.PropagateForumCategories(thread.CategoryID, map[string]interface{}{"threads": recentThreads}, "category_threads_updated")

	WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) likeThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "threadId")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	if _, err := h.svc.GetThread(id); err != nil {
		WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	count, err := h.svc.LikeThread(id, claims.UserID)
	if err != nil {
		log.Printf("forum.likeThread: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to like thread")
		return
	}

	h.hub.PropagateForumThread(id, map[string]interface{}{
		"thread_id": id, "likes": count, "user_id": claims.UserID,
	}, "thread_liked")
	WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "liked", "likes": count})
}

func (h *Handler) unlikeThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "threadId")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	if _, err := h.svc.GetThread(id); err != nil {
		WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	count, err := h.svc.UnlikeThread(id, claims.UserID)
	if err != nil {
		log.Printf("forum.unlikeThread: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to unlike thread")
		return
	}

	h.hub.PropagateForumThread(id, map[string]interface{}{
		"thread_id": id, "likes": count, "user_id": claims.UserID,
	}, "thread_unliked")
	WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "unliked", "likes": count})
}

// Comment handlers

func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	limit, offset := 50, 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	comments, err := h.svc.ListThreadComments(id, limit, offset)
	if err != nil {
		log.Printf("forum.listComments: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to fetch comments")
		return
	}

	var userID int64
	claims, hasClaims := ClaimsFromCtx(r)
	if hasClaims {
		userID = claims.UserID
	}

	for _, c := range comments {
		if userID > 0 {
			if isLiked, err := h.svc.IsCommentLikedByUser(c.ID, userID); err == nil {
				c.IsLiked = isLiked
			}
		}
		if hasClaims {
			c.CanLikeComments = HasClaim(claims, "thread.canLikeComments")
			c.CanDelete = userID == c.UserID || HasClaim(claims, "forum.delete-post")
			c.CanEdit = userID == c.UserID || HasClaim(claims, "forum.edit-post")
		}
	}

	WriteJSON(w, http.StatusOK, comments)
}

func (h *Handler) createComment(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		WriteError(w, http.StatusBadRequest, "content required")
		return
	}

	created, err := h.svc.CreateComment(&models.ThreadComment{
		ThreadID: id,
		UserID:   claims.UserID,
		Content:  req.Content,
	})
	if err != nil {
		log.Printf("forum.createComment: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to create comment")
		return
	}

	// Enrich with user info for the WS payload
	if enriched, err := h.svc.GetComment(created.ID); err == nil {
		created = enriched
	}

	h.hub.PropagateForumThread(id, map[string]interface{}{"new_comment": created}, "comment_created")
	WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) updateComment(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	if comment.UserID != claims.UserID && !HasClaim(claims, "forum.edit-post") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		WriteError(w, http.StatusBadRequest, "content required")
		return
	}
	comment.Content = req.Content

	updated, err := h.svc.UpdateComment(comment)
	if err != nil {
		log.Printf("forum.updateComment: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to update comment")
		return
	}

	h.hub.PropagateForumThread(updated.ThreadID, map[string]interface{}{"comment": updated}, "comment_updated")
	WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteComment(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	if comment.UserID != claims.UserID && !HasClaim(claims, "forum.delete-post") && !HasClaim(claims, "thread.canDeleteThreadComment") {
		WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	threadID := comment.ThreadID
	if err := h.svc.DeleteComment(id); err != nil {
		log.Printf("forum.deleteComment: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete comment")
		return
	}

	h.hub.PropagateForumThread(threadID, map[string]interface{}{"comment_id": id}, "comment_deleted")
	WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) likeComment(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "commentId")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	count, err := h.svc.LikeComment(id, claims.UserID)
	if err != nil {
		log.Printf("forum.likeComment: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to like comment")
		return
	}

	h.hub.PropagateForumThread(comment.ThreadID, map[string]interface{}{
		"comment_id": id, "likes": count, "user_id": claims.UserID,
	}, "comment_liked")
	WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "liked", "likes": count})
}

func (h *Handler) unlikeComment(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromCtx(r)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "commentId")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	count, err := h.svc.UnlikeComment(id, claims.UserID)
	if err != nil {
		log.Printf("forum.unlikeComment: %v", err)
		WriteError(w, http.StatusInternalServerError, "failed to unlike comment")
		return
	}

	h.hub.PropagateForumThread(comment.ThreadID, map[string]interface{}{
		"comment_id": id, "likes": count, "user_id": claims.UserID,
	}, "comment_unliked")
	WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "unliked", "likes": count})
}

// marshalPayload encodes v to json.RawMessage, silently ignoring errors.
func marshalPayload(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
