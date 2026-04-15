package forum

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	ievents "github.com/skaia/backend/internal/events"
	iupload "github.com/skaia/backend/internal/upload"
	"github.com/skaia/backend/internal/utils"
	ws "github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// NotifSender is the minimal interface the forum handler needs to send user notifications.
type NotifSender interface {
	Send(userID int64, notifType, message, route string) (*models.Notification, error)
}

// Handler exposes all forum HTTP endpoints.
type Handler struct {
	svc        *Service
	hub        *ws.Hub
	notifSvc   NotifSender
	authz      utils.Authorizer
	dispatcher *ievents.Dispatcher
}

// NewHandler creates a Handler.
func NewHandler(svc *Service, hub *ws.Hub, notifSvc NotifSender, authz utils.Authorizer, dispatcher *ievents.Dispatcher) *Handler {
	return &Handler{svc: svc, hub: hub, notifSvc: notifSvc, authz: authz, dispatcher: dispatcher}
}

// Mount registers all forum routes on r.
func (h *Handler) Mount(r chi.Router, jwt, optJWT func(http.Handler) http.Handler) {
	r.Route("/forum", func(r chi.Router) {
		// Category routes
		r.With(optJWT).Get("/categories", h.listCategories)
		r.With(jwt).Post("/categories", h.createCategory)
		r.With(jwt).Delete("/categories/{id}", h.deleteCategory)

		// Category-scoped thread listing
		r.With(optJWT).Get("/categories/{id}/threads", h.listCategoryThreads)

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
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type CategoryWithThreads struct {
		*models.ForumCategory
		Threads []*models.ForumThread `json:"threads"`
	}

	var out []*CategoryWithThreads
	for _, cat := range categories {
		threads, err := h.svc.ListCategoryThreads(cat.ID, 5, 0)
		if err != nil {
			threads = []*models.ForumThread{}
		}
		out = append(out, &CategoryWithThreads{ForumCategory: cat, Threads: threads})
	}
	utils.WriteJSON(w, http.StatusOK, out)
}

// listCategoryThreads handles GET /forum/categories/{id}/threads
func (h *Handler) listCategoryThreads(w http.ResponseWriter, r *http.Request) {
	categoryID, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}
	q := r.URL.Query()
	limit := 20
	offset := 0
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	threads, err := h.svc.ListCategoryThreads(categoryID, limit, offset)
	if err != nil {
		log.Printf("forum.listCategoryThreads: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to fetch threads")
		return
	}
	if threads == nil {
		threads = []*models.ForumThread{}
	}
	utils.WriteJSON(w, http.StatusOK, threads)
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "forum.category-new") {
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

	created, err := h.svc.CreateCategory(&models.ForumCategory{
		Name:         req.Name,
		Description:  req.Description,
		DisplayOrder: req.DisplayOrder,
	})
	if err != nil {
		log.Printf("forum.createCategory: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create category")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCategoryCreated,
		Resource:   ievents.ResForumCategory,
		ResourceID: created.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"name": created.Name},
		Fn: func() {
			h.hub.Broadcast(&ws.Message{
				Type: ws.ForumUpdate,
				Payload: marshalPayload(map[string]interface{}{
					"action": "category_created",
					"data":   created,
				}),
			})
		},
	})
	utils.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "forum.category-delete") {
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}

	if err := h.svc.DeleteCategory(id); err != nil {
		log.Printf("forum.deleteCategory: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCategoryDeleted,
		Resource:   ievents.ResForumCategory,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			h.hub.Broadcast(&ws.Message{
				Type: ws.ForumUpdate,
				Payload: marshalPayload(map[string]interface{}{
					"action": "category_deleted",
					"id":     id,
				}),
			})
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// Thread handlers

func (h *Handler) listThreads(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit := 20
	offset := 0
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	// Filter by author
	if authorStr := q.Get("author_id"); authorStr != "" {
		authorID, err := strconv.ParseInt(authorStr, 10, 64)
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid author_id")
			return
		}
		threads, err := h.svc.ListUserThreads(authorID, limit, offset)
		if err != nil {
			log.Printf("forum.listThreads(author): %v", err)
			utils.WriteError(w, http.StatusInternalServerError, "failed to fetch threads")
			return
		}
		if threads == nil {
			threads = []*models.ForumThread{}
		}
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"threads": threads})
		return
	}

	// Filter by category
	if catStr := q.Get("category_id"); catStr != "" {
		categoryID, err := strconv.ParseInt(catStr, 10, 64)
		if err != nil {
			utils.WriteError(w, http.StatusBadRequest, "invalid category_id")
			return
		}
		threads, err := h.svc.ListCategoryThreads(categoryID, limit, offset)
		if err != nil {
			log.Printf("forum.listThreads(category): %v", err)
			utils.WriteError(w, http.StatusInternalServerError, "failed to fetch threads")
			return
		}
		if threads == nil {
			threads = []*models.ForumThread{}
		}
		utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"threads": threads})
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"threads": []interface{}{}})
}

func (h *Handler) createThread(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "forum.thread-new") {
		return
	}

	var req struct {
		CategoryID string `json:"category_id"`
		Title      string `json:"title"`
		Content    string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" || req.Content == "" || req.CategoryID == "" {
		utils.WriteError(w, http.StatusBadRequest, "title, content, and category_id required")
		return
	}

	categoryID, err := strconv.ParseInt(req.CategoryID, 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid category ID")
		return
	}

	created, err := h.svc.CreateThread(&models.ForumThread{
		CategoryID: categoryID,
		UserID:     userID,
		Title:      req.Title,
		Content:    req.Content,
	})
	if err != nil {
		log.Printf("forum.createThread: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create thread")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActThreadCreated,
		Resource:   ievents.ResForum,
		ResourceID: created.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"title": created.Title, "category_id": categoryID},
		Fn: func() {
			h.hub.Broadcast(&ws.Message{
				Type: ws.ForumUpdate,
				Payload: marshalPayload(map[string]interface{}{
					"action": "thread_created",
					"data":   created,
				}),
			})
			h.hub.PropagateForumThread(created.ID, created, "thread_created")
			if recentThreads, err := h.svc.ListCategoryThreads(categoryID, 5, 0); err == nil && len(recentThreads) > 0 {
				h.hub.PropagateForumCategories(categoryID, map[string]interface{}{"threads": recentThreads}, "category_threads_updated")
			}
		},
	})

	utils.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) getThread(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	thread, err := h.svc.GetThread(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	_ = h.svc.IncrementViewCount(id)

	userID, hasClaims := utils.UserIDFromCtx(r)

	if userID > 0 {
		if isLiked, err := h.svc.IsThreadLikedByUser(id, userID); err == nil {
			thread.IsLiked = isLiked
		}
	}

	if hasClaims {
		thread.CanLikeComments = true
		canDelComment, _ := h.authz.HasPermission(userID, "forum.thread-comment-delete")
		thread.CanDeleteThreadComment = canDelComment
		thread.CanLikeThreads = true
		canEdit, _ := h.authz.HasPermission(userID, "forum.thread-edit")
		thread.CanEdit = userID == thread.UserID || canEdit
		canDel, _ := h.authz.HasPermission(userID, "forum.thread-delete")
		thread.CanDelete = userID == thread.UserID || canDel
	}

	utils.WriteJSON(w, http.StatusOK, thread)
}

func (h *Handler) updateThread(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	thread, err := h.svc.GetThread(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	canEdit, _ := h.authz.HasPermission(userID, "forum.thread-edit")
	if thread.UserID != userID && !canEdit {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	thread.Title = req.Title
	thread.Content = req.Content

	updated, err := h.svc.UpdateThread(thread)
	if err != nil {
		log.Printf("forum.updateThread: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to update thread")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActThreadUpdated,
		Resource:   ievents.ResForum,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"title": thread.Title},
		Fn: func() {
			h.hub.PropagateForumThread(id, updated, "thread_updated")
			if recentThreads, err := h.svc.ListCategoryThreads(thread.CategoryID, 5, 0); err == nil && len(recentThreads) > 0 {
				h.hub.PropagateForumCategories(thread.CategoryID, map[string]interface{}{"threads": recentThreads}, "category_threads_updated")
			}
			if h.notifSvc != nil && thread.UserID != userID {
				_, _ = h.notifSvc.Send(
					thread.UserID,
					"thread_edited",
					fmt.Sprintf("Your thread \"%.60s\" was edited by a moderator", thread.Title),
					"/view-thread/"+strconv.FormatInt(id, 10),
				)
			}
		},
	})

	utils.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteThread(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	thread, err := h.svc.GetThread(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	canDel, _ := h.authz.HasPermission(userID, "forum.thread-delete")
	if thread.UserID != userID && !canDel {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	// Collect all upload URLs referenced in thread content + comments
	// so the files can be removed from disk after the DB delete.
	var uploadURLs []string
	uploadURLs = append(uploadURLs, iupload.ExtractUploadURLs(thread.Content)...)
	if comments, err := h.svc.ListThreadComments(id, 10000, 0); err == nil {
		for _, c := range comments {
			uploadURLs = append(uploadURLs, iupload.ExtractUploadURLs(c.Content)...)
		}
	}

	if err := h.svc.DeleteThread(id); err != nil {
		log.Printf("forum.deleteThread: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete thread")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActThreadDeleted,
		Resource:   ievents.ResForum,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"title": thread.Title, "category_id": thread.CategoryID},
		Fn: func() {
			for _, u := range uploadURLs {
				iupload.DeleteUploadFile(u)
			}
			h.hub.PropagateForumThread(id, nil, "thread_deleted")
			h.hub.Broadcast(&ws.Message{
				Type: ws.ForumUpdate,
				Payload: marshalPayload(map[string]interface{}{
					"action": "thread_deleted",
					"id":     id,
				}),
			})
			recentThreads, _ := h.svc.ListCategoryThreads(thread.CategoryID, 5, 0)
			h.hub.PropagateForumCategories(thread.CategoryID, map[string]interface{}{"threads": recentThreads}, "category_threads_updated")
			if h.notifSvc != nil && thread.UserID != userID {
				_, _ = h.notifSvc.Send(
					thread.UserID,
					"thread_deleted",
					fmt.Sprintf("Your thread \"%.60s\" was removed by a moderator", thread.Title),
					"/forum",
				)
			}
		},
	})

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) likeThread(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "threadId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	thread, err := h.svc.GetThread(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	count, err := h.svc.LikeThread(id, userID)
	if err != nil {
		log.Printf("forum.likeThread: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to like thread")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActThreadLiked,
		Resource:   ievents.ResForum,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			h.hub.PropagateForumThread(id, map[string]interface{}{
				"thread_id": id, "likes": count, "user_id": userID,
			}, "thread_liked")
			if h.notifSvc != nil && thread.UserID != userID {
				_, _ = h.notifSvc.Send(
					thread.UserID,
					"thread_liked",
					fmt.Sprintf("Someone liked your thread: %s", thread.Title),
					"/view-thread/"+strconv.FormatInt(id, 10),
				)
			}
		},
	})

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "liked", "likes": count})
}

func (h *Handler) unlikeThread(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "threadId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	if _, err := h.svc.GetThread(id); err != nil {
		utils.WriteError(w, http.StatusNotFound, "thread not found")
		return
	}

	count, err := h.svc.UnlikeThread(id, userID)
	if err != nil {
		log.Printf("forum.unlikeThread: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to unlike thread")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActThreadUnliked,
		Resource:   ievents.ResForum,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			h.hub.PropagateForumThread(id, map[string]interface{}{
				"thread_id": id, "likes": count, "user_id": userID,
			}, "thread_unliked")
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "unliked", "likes": count})
}

// Comment handlers

func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid thread ID")
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
		utils.WriteError(w, http.StatusInternalServerError, "failed to fetch comments")
		return
	}

	userID, hasClaims := utils.UserIDFromCtx(r)

	var canDelComment bool
	if hasClaims {
		canDelComment, _ = h.authz.HasPermission(userID, "forum.thread-comment-delete")
	}

	for _, c := range comments {
		if userID > 0 {
			if isLiked, err := h.svc.IsCommentLikedByUser(c.ID, userID); err == nil {
				c.IsLiked = isLiked
			}
		}
		if hasClaims {
			c.CanLikeComments = true
			c.CanDelete = userID == c.AuthorID || canDelComment
			c.CanEdit = userID == c.AuthorID || canDelComment
		}
	}

	utils.WriteJSON(w, http.StatusOK, comments)
}

func (h *Handler) createComment(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !utils.CheckPerm(w, h.authz, userID, "forum.thread-comment-new") {
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid thread ID")
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		utils.WriteError(w, http.StatusBadRequest, "content required")
		return
	}

	created, err := h.svc.CreateComment(&models.ThreadComment{
		ThreadID: id,
		AuthorID: userID,
		Content:  req.Content,
	})
	if err != nil {
		log.Printf("forum.createComment: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to create comment")
		return
	}

	// Enrich with user info for the WS payload
	if enriched, err := h.svc.GetComment(created.ID); err == nil {
		created = enriched
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCommentCreated,
		Resource:   ievents.ResForumComment,
		ResourceID: created.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"thread_id": id},
		Fn: func() {
			h.hub.PropagateForumThread(id, map[string]interface{}{"new_comment": created}, "comment_created")
			if h.notifSvc != nil {
				if thread, err := h.svc.GetThread(id); err == nil && thread.UserID != userID {
					_, _ = h.notifSvc.Send(
						thread.UserID,
						"comment_on_thread",
						fmt.Sprintf("Someone commented on your thread: %s", thread.Title),
						"/view-thread/"+strconv.FormatInt(id, 10),
					)
				}
			}
		},
	})

	utils.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) updateComment(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	canEdit, _ := h.authz.HasPermission(userID, "forum.thread-comment-delete")
	if comment.AuthorID != userID && !canEdit {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		utils.WriteError(w, http.StatusBadRequest, "content required")
		return
	}
	comment.Content = req.Content

	updated, err := h.svc.UpdateComment(comment)
	if err != nil {
		log.Printf("forum.updateComment: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to update comment")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCommentUpdated,
		Resource:   ievents.ResForumComment,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"thread_id": updated.ThreadID},
		Fn: func() {
			h.hub.PropagateForumThread(updated.ThreadID, map[string]interface{}{"comment": updated}, "comment_updated")
		},
	})
	utils.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteComment(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	canDel, _ := h.authz.HasPermission(userID, "forum.thread-comment-delete")
	if comment.AuthorID != userID && !canDel {
		utils.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	// Collect upload URLs from the comment content for cleanup.
	commentUploadURLs := iupload.ExtractUploadURLs(comment.Content)

	threadID := comment.ThreadID
	if err := h.svc.DeleteComment(id); err != nil {
		log.Printf("forum.deleteComment: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to delete comment")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCommentDeleted,
		Resource:   ievents.ResForumComment,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"thread_id": threadID},
		Fn: func() {
			for _, u := range commentUploadURLs {
				iupload.DeleteUploadFile(u)
			}
			h.hub.PropagateForumThread(threadID, map[string]interface{}{"comment_id": id}, "comment_deleted")
			if h.notifSvc != nil && comment.AuthorID != userID {
				_, _ = h.notifSvc.Send(
					comment.AuthorID,
					"comment_deleted",
					"Your comment was removed by a moderator",
					"/view-thread/"+strconv.FormatInt(threadID, 10),
				)
			}
		},
	})

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) likeComment(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "commentId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	count, err := h.svc.LikeComment(id, userID)
	if err != nil {
		log.Printf("forum.likeComment: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to like comment")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCommentLiked,
		Resource:   ievents.ResForumComment,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"thread_id": comment.ThreadID, "likes": count},
		Fn: func() {
			h.hub.PropagateForumThread(comment.ThreadID, map[string]interface{}{
				"comment_id": id, "likes": count, "user_id": userID,
			}, "comment_liked")
			if h.notifSvc != nil && comment.AuthorID != userID {
				_, _ = h.notifSvc.Send(
					comment.AuthorID,
					"comment_liked",
					"Someone liked your comment",
					"/view-thread/"+strconv.FormatInt(comment.ThreadID, 10),
				)
			}
		},
	})

	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "liked", "likes": count})
}

func (h *Handler) unlikeComment(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := h.parseID(r, "commentId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid comment ID")
		return
	}

	comment, err := h.svc.GetComment(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "comment not found")
		return
	}

	count, err := h.svc.UnlikeComment(id, userID)
	if err != nil {
		log.Printf("forum.unlikeComment: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to unlike comment")
		return
	}

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActCommentUnliked,
		Resource:   ievents.ResForumComment,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"thread_id": comment.ThreadID, "likes": count},
		Fn: func() {
			h.hub.PropagateForumThread(comment.ThreadID, map[string]interface{}{
				"comment_id": id, "likes": count, "user_id": userID,
			}, "comment_unliked")
		},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]interface{}{"status": "unliked", "likes": count})
}

// marshalPayload encodes v to json.RawMessage, silently ignoring errors.
func marshalPayload(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
