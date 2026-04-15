package inbox

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Handler exposes inbox HTTP endpoints.
type Handler struct {
	svc        *Service
	dispatcher *ievents.Dispatcher
}

// NewHandler creates a Handler.
func NewHandler(svc *Service, dispatcher *ievents.Dispatcher) *Handler {
	return &Handler{svc: svc, dispatcher: dispatcher}
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
		r.Delete("/conversations/{id}", h.deleteConversation)
		// Message deletion
		r.Delete("/messages/{id}", h.deleteMessage)
		// Unread total badge
		r.Get("/unread", h.unreadTotal)
		// Blocks
		r.Post("/block/{id}", h.blockUser)
		r.Delete("/block/{id}", h.unblockUser)
		r.Get("/blocked", h.listBlockedUsers)
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
		if err == errBlocked {
			utils.WriteError(w, http.StatusForbidden, "this user is blocked or has blocked you")
			return
		}
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
		Content        string `json:"content"`
		MessageType    string `json:"message_type"`
		AttachmentURL  string `json:"attachment_url"`
		AttachmentName string `json:"attachment_name"`
		AttachmentSize int64  `json:"attachment_size"`
		AttachmentMime string `json:"attachment_mime"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Content == "" && body.AttachmentURL == "" {
		utils.WriteError(w, http.StatusBadRequest, "content or attachment required")
		return
	}
	msgType := body.MessageType
	if msgType == "" {
		msgType = "text"
	}
	msg, err := h.svc.SendMessage(&models.InboxMessage{
		ConversationID: id,
		SenderID:       userID,
		Content:        body.Content,
		MessageType:    msgType,
		AttachmentURL:  body.AttachmentURL,
		AttachmentName: body.AttachmentName,
		AttachmentSize: body.AttachmentSize,
		AttachmentMime: body.AttachmentMime,
	})
	if err != nil {
		if err == errForbidden {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
		if err == errBlocked {
			utils.WriteError(w, http.StatusForbidden, "this user is blocked or has blocked you")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusCreated, msg)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActMessageSent,
		Resource:   ievents.ResMessage,
		ResourceID: msg.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"conversation_id": id, "type": msgType},
	})
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
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActMessageDeleted,
		Resource:   ievents.ResMessage,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
	})
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

func (h *Handler) deleteConversation(w http.ResponseWriter, r *http.Request) {
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
	if err := h.svc.DeleteConversation(id, userID); err != nil {
		if err == errForbidden {
			utils.WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActMessageDeleted,
		Resource:   ievents.ResConversation,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"action": "conversation_deleted"},
	})
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) blockUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.BlockUser(userID, targetID); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActUserBlocked,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
	})
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) unblockUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.UnblockUser(userID, targetID); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActUserUnblocked,
		Resource:   ievents.ResUser,
		ResourceID: targetID,
		IP:         ievents.ClientIP(r),
	})
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) listBlockedUsers(w http.ResponseWriter, r *http.Request) {
	userID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	users, err := h.svc.ListBlockedUsers(userID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if users == nil {
		users = []*models.User{}
	}
	utils.WriteJSON(w, http.StatusOK, users)
}
