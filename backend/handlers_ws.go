package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
	"github.com/skaia/backend/auth"
	wshub "github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

type SocketMessage struct {
	Type       string          `json:"type"` // auth, update, delete, create, like, unlike, sync, error
	Action     string          `json:"action"`
	EntityType string          `json:"entityType"` // thread, post, user, permission, like
	Data       json.RawMessage `json:"data"`
	UserID     int64           `json:"user_id,omitempty"`
}

type SocketClient struct {
	conn   *websocket.Conn
	appCtx *AppContext
	user   *models.User
	send   chan SocketMessage
}

// authenticateWS validates JWT token from WebSocket connection
func (h *SocketClient) authenticateWS(token string) error {
	if token == "" {
		return wrapError("missing token")
	}

	claims, err := auth.ValidateToken(token)
	if err != nil {
		return wrapError("invalid token")
	}

	user, err := h.appCtx.UserRepo.GetUserByID(claims.UserID)
	if err != nil {
		return wrapError("user not found")
	}

	if user.IsSuspended {
		return wrapError("user account is suspended")
	}

	h.user = user
	return nil
}

// handleSocketMessage processes incoming WebSocket messages
func (c *SocketClient) handleSocketMessage(msg SocketMessage) error {
	switch msg.Type {
	case "auth":
		return c.handleAuth(msg)
	case "create":
		return c.handleCreate(msg)
	case "update":
		return c.handleUpdate(msg)
	case "delete":
		return c.handleDelete(msg)
	case "like":
		return c.handleLike(msg)
	case "unlike":
		return c.handleUnlike(msg)
	case "sync":
		return c.handleSync(msg)
	default:
		return wrapError("unknown message type")
	}
}

func (c *SocketClient) handleAuth(msg SocketMessage) error {
	var authData struct {
		Token string `json:"token"`
	}

	if err := json.Unmarshal(msg.Data, &authData); err != nil {
		return wrapError("invalid auth data")
	}

	return c.authenticateWS(authData.Token)
}

func (c *SocketClient) handleCreate(msg SocketMessage) error {
	if c.user == nil {
		return wrapError("not authenticated")
	}

	switch msg.EntityType {
	case "post":
		return c.handleCreateComment(msg)
	case "thread":
		return c.handleCreateThread(msg)
	default:
		return wrapError("unknown entity type")
	}
}

func (c *SocketClient) handleCreateComment(msg SocketMessage) error {
	if !c.hasPermission("forum.post") {
		return wrapError("insufficient permissions")
	}

	var postData struct {
		ThreadID string `json:"threadId"`
		Content  string `json:"content"`
	}

	if err := json.Unmarshal(msg.Data, &postData); err != nil {
		return wrapError("invalid post data")
	}

	threadID, err := strconv.ParseInt(postData.ThreadID, 10, 64)
	if err != nil {
		return wrapError("invalid thread id")
	}

	post := &models.ThreadComment{
		ThreadID:  threadID,
		UserID:    c.user.ID,
		Content:   postData.Content,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	createdPost, err := c.appCtx.ThreadCommentRepo.CreateThreadComment(post)
	if err != nil {
		log.Printf("Error creating post: %v", err)
		return wrapError("failed to create post")
	}

	// TODO: Broadcast post creation to all users
	_ = createdPost

	return nil
}

func (c *SocketClient) handleCreateThread(msg SocketMessage) error {
	if !c.hasPermission("forum.thread") {
		return wrapError("insufficient permissions")
	}

	var threadData struct {
		CategoryID string `json:"categoryId"`
		Title      string `json:"title"`
		Content    string `json:"content"`
	}

	if err := json.Unmarshal(msg.Data, &threadData); err != nil {
		return wrapError("invalid thread data")
	}

	categoryID, err := strconv.ParseInt(threadData.CategoryID, 10, 64)
	if err != nil {
		return wrapError("invalid category id")
	}

	thread := &models.ForumThread{
		CategoryID: categoryID,
		UserID:     c.user.ID,
		Title:      threadData.Title,
		Content:    threadData.Content,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	_, err = c.appCtx.ForumThreadRepo.CreateThread(thread)
	if err != nil {
		log.Printf("Error creating thread: %v", err)
		return wrapError("failed to create thread")
	}

	return nil
}

func (c *SocketClient) handleUpdate(msg SocketMessage) error {
	if c.user == nil {
		return wrapError("not authenticated")
	}

	switch msg.EntityType {
	case "post":
		return c.handleUpdateComment(msg)
	default:
		return wrapError("unknown entity type")
	}
}

func (c *SocketClient) handleUpdateComment(msg SocketMessage) error {
	var updateData struct {
		ID      string `json:"id"`
		Content string `json:"content"`
	}

	if err := json.Unmarshal(msg.Data, &updateData); err != nil {
		return wrapError("invalid update data")
	}

	postID, err := strconv.ParseInt(updateData.ID, 10, 64)
	if err != nil {
		return wrapError("invalid post id")
	}

	// Fetch the comment to check permissions
	post, err := c.appCtx.ThreadCommentRepo.GetThreadCommentByID(postID)
	if err != nil {
		return wrapError("comment not found")
	}

	// Check if user owns the post or has moderator privileges
	if post.UserID != c.user.ID && !c.hasPermission("forum.moderate") {
		return wrapError("insufficient permissions")
	}

	post.Content = updateData.Content
	post.UpdatedAt = time.Now()

	_, err = c.appCtx.ThreadCommentRepo.UpdateThreadComment(post)
	if err != nil {
		log.Printf("Error updating post: %v", err)
		return wrapError("failed to update post")
	}

	return nil
}

func (c *SocketClient) handleDelete(msg SocketMessage) error {
	if c.user == nil {
		return wrapError("not authenticated")
	}

	switch msg.EntityType {
	case "post":
		return c.handleDeleteComment(msg)
	default:
		return wrapError("unknown entity type")
	}
}

func (c *SocketClient) handleDeleteComment(msg SocketMessage) error {
	var delData struct {
		ID string `json:"id"`
	}

	if err := json.Unmarshal(msg.Data, &delData); err != nil {
		return wrapError("invalid delete data")
	}

	postID, err := strconv.ParseInt(delData.ID, 10, 64)
	if err != nil {
		return wrapError("invalid post id")
	}

	post2, err := c.appCtx.ThreadCommentRepo.GetThreadCommentByID(postID)
	if err != nil {
		return wrapError("comment not found")
	}

	// Check if user owns the post or has moderator privileges
	if post2.UserID != c.user.ID && !c.hasPermission("forum.moderate") {
		return wrapError("insufficient permissions")
	}

	if err := c.appCtx.ThreadCommentRepo.DeleteThreadComment(postID); err != nil {
		log.Printf("Error deleting comment: %v", err)
		return wrapError("failed to delete comment")
	}

	return nil
}

func (c *SocketClient) handleLike(msg SocketMessage) error {
	if c.user == nil {
		return wrapError("not authenticated")
	}

	// TODO: Implement post likes (requires database schema changes to track likes)
	// For now, this is a placeholder

	return nil
}

func (c *SocketClient) handleUnlike(msg SocketMessage) error {
	if c.user == nil {
		return wrapError("not authenticated")
	}

	// TODO: Implement post unlikes (requires database schema changes to track likes)
	// For now, this is a placeholder

	return nil
}

func (c *SocketClient) handleSync(msg SocketMessage) error {
	if c.user == nil {
		return wrapError("not authenticated")
	}

	// Send current forum data to the client
	// TODO: Implement data sync

	return nil
}

func (c *SocketClient) hasPermission(permission string) bool {
	if c.user == nil {
		return false
	}

	// Admin has all permissions
	for _, role := range c.user.Roles {
		if role == "admin" {
			return true
		}
	}

	// Check user permissions
	for _, perm := range c.user.Permissions {
		if perm == permission {
			return true
		}
	}

	return false
}

func wrapError(msg string) error {
	return errors.New(msg)
}

// ReadPump reads messages from the WebSocket connection
func (c *SocketClient) readPump() {
	defer c.conn.Close()

	c.conn.SetReadDeadline(time.Time{})
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var msg SocketMessage
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			return
		}

		if err := c.handleSocketMessage(msg); err != nil {
			c.sendError(err.Error())
		}
	}
}

// WritePump writes messages to the WebSocket connection
func (c *SocketClient) writePump() {
	for msg := range c.send {
		if err := c.conn.WriteJSON(msg); err != nil {
			return
		}
	}
}

func (c *SocketClient) sendError(errMsg string) {
	msg := SocketMessage{
		Type: "error",
		Data: json.RawMessage([]byte(`{"error":"` + errMsg + `"}`)),
	}

	select {
	case c.send <- msg:
	default:
		log.Println("Send channel full")
	}
}

// WSHandler handles WebSocket connections using Hub-based subscriptions
func WSHandler(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins (should validate in production)
			},
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		// Create Hub-based client for subscription management
		client := &wshub.Client{
			Hub:  appCtx.WebSocketHub,
			Conn: conn,
			Send: make(chan *wshub.Message, 256),
		}

		// Register with Hub for subscription tracking
		appCtx.WebSocketHub.RegisterClient(client)

		// Start Hub client pumps for subscription-based updates
		go client.ReadPump()
		go client.WritePump()
	}
}
