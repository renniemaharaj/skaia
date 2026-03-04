package inbox

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Handler exposes inbox HTTP endpoints.
type Handler struct {
	svc *Service
}

// NewHandler creates a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Mount registers inbox routes on r.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/inbox", func(r chi.Router) {
		r.Use(jwt)
		// Conversation list + create/find
		r.Get("/conversations", h.listConversations)
		r.Post("/conversations", h.startConversation)
		// Conversation-scoped
		r.Get("/conversations/{id}/messages", h.listMessages)
		r.Post("/conversations/{id}/messages", h.sendMessage)
		r.Put("/conversations/{id}/read", h.markRead)
		// Message deletion
		r.Delete("/messages/{id}", h.deleteMessage)
		// Unread total badge
		r.Get("/unread", h.unreadTotal)
	})
}

func (h *Handler) listConversations(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	convs, err := h.svc.ListConversations(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if convs == nil {
		convs = []*models.InboxConversation{}
	}
	utils.WriteJSON(w, http.StatusOK, convs)
}

func (h *Handler) startConversation(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		TargetUserID   int64  `json:"target_user_id"`
		TargetUsername string `json:"target_username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Resolve by username if no numeric ID was provided
	targetID := body.TargetUserID
	if targetID == 0 && body.TargetUsername != "" {
		u, err := h.svc.FindUserByUsername(body.TargetUsername)
		if err != nil || u == nil {
			utils.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		targetID = u.ID
	}
	if targetID == 0 {
		utils.WriteError(w, http.StatusBadRequest, "target_user_id or target_username required")
		return
	}
	if targetID == userID {
		utils.WriteError(w, http.StatusBadRequest, "cannot message yourself")
		return
	}
	conv, err := h.svc.GetOrStartConversation(userID, targetID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, conv)
}

func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	limit := int64(30)
	offset := int64(0)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, e := strconv.ParseInt(v, 10, 64); e == nil {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, e := strconv.ParseInt(v, 10, 64); e == nil {
			offset = n
		}
	}
	msgs, err := h.svc.ListMessages(id, userID, limit, offset)
	if err != nil {
		if err == errForbidden {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if msgs == nil {
		msgs = []*models.InboxMessage{}
	}
	utils.WriteJSON(w, http.StatusOK, msgs)
}

func (h *Handler) sendMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		utils.WriteError(w, http.StatusBadRequest, "content required")
		return
	}
	msg, err := h.svc.SendMessage(body.Content, id, userID)
	if err != nil {
		if err == errForbidden {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusCreated, msg)
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.MarkRead(id, userID); err != nil {
		if err == errForbidden {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deleteMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.DeleteMessage(id, userID); err != nil {
		utils.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) unreadTotal(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	count, err := h.svc.UnreadTotal(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]int{"count": count})
}
