package ws

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	log "github.com/skaia/backend/internal/syslog"
	wspb "github.com/skaia/grpc/ws"
	"google.golang.org/protobuf/proto"
)

// Client represents a single WebSocket connection managed by the Hub.
type Client struct {
	Hub         *Hub
	Conn        *websocket.Conn
	Send        chan []byte
	ClientID    int64 // unique per connection, assigned by Hub at registration
	UserID      int64
	RealIP      string // extracted at connection time for ip hopping mitigation
	Permissions []string
	Roles       []string
	SessionID   int64 // session bucket for chat, presence & cursor fan-out
	// Presence fields - written under Hub.mu.Lock via presenceUpdates.
	Route            string
	UserName         string
	Avatar           string
	IsMuted          bool
	GuestSessionID   string
	RecoveryAccepted bool
	// Per-client rate limiters - used only from ReadPump (single goroutine).
	chatLimit      rateBucket
	cursorLimit    rateBucket
	presenceLimit  rateBucket
	broadcastLimit rateBucket
	// lastChatAt tracks when the last global chat message was sent, for slow-mode enforcement.
	lastChatAt time.Time
}

func (c *Client) HasPermission(perm string) bool {
	for _, p := range c.Permissions {
		if p == perm || p == "*" || (len(p) > 2 && p[len(p)-2:] == ".*" && len(perm) >= len(p)-2 && perm[:len(p)-2] == p[:len(p)-2]) {
			return true
		}
	}
	return false
}

const (
	// pongWait is how long we wait for a pong before considering the
	// connection dead. Clients must respond to pings within this window.
	pongWait = 15 * time.Second
	// pingPeriod is how often we send pings. Must be shorter than pongWait
	// so the peer has time to reply before the read deadline fires.
	pingPeriod = 10 * time.Second
	// writeWait is the deadline for any individual write (message or ping).
	writeWait = 10 * time.Second
)

// ReadPump pumps inbound messages from the connection to the hub.
// It runs in its own goroutine for each client.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		messageType, reader, err := c.Conn.NextReader()
		if err != nil {
			return
		}

		if messageType != websocket.BinaryMessage {
			return
		}

		msg, err := decodeProtoMessageFromReader(reader)
		if err != nil {
			// Malformed proto frames are treated as fatal so a bad client
			// cannot keep a half-valid binary connection alive.
			return
		}
		c.handleMessage(msg)
	}
}

func decodeProtoMessageFromReader(reader io.Reader) (Message, error) {
	data, err := io.ReadAll(reader)
	if err != nil {
		return Message{}, err
	}
	return decodeProtoMessage(data)
}

func decodeProtoMessage(data []byte) (Message, error) {
	var pb wspb.WebSocketMessage
	if err := proto.Unmarshal(data, &pb); err != nil {
		return Message{}, err
	}
	// NOTE: inbound payloads still contain JSON bytes inside the protobuf
	// envelope. Typed client messages will let Message.Payload stop assuming
	// json.RawMessage.
	return Message{
		Type:    MessageType(pb.GetType()),
		UserID:  pb.GetUserId(),
		Payload: json.RawMessage(pb.GetPayload()),
	}, nil
}

func encodeProtoMessage(msg *Message) ([]byte, error) {
	return proto.Marshal(&wspb.WebSocketMessage{
		Type:    string(msg.Type),
		UserId:  msg.UserID,
		Payload: []byte(msg.Payload),
	})
}

func encodeProtoServerMessage(msg *Message) ([]byte, error) {
	return proto.Marshal(&wspb.ServerMessage{
		Type:    string(msg.Type),
		UserId:  msg.UserID,
		Payload: []byte(msg.Payload),
	})
}

func (c *Client) encodeOutboundMessage(msg *Message) ([]byte, error) {
	return encodeProtoServerMessage(msg)
}

func (c *Client) queueMessage(msg *Message) bool {
	data, err := c.encodeOutboundMessage(msg)
	if err != nil {
		return false
	}
	select {
	case c.Send <- data:
		return true
	default:
		return false
	}
}

func (c *Client) handleMessage(msg Message) {
	// user identity is set at connection time from JWT; never trust the client
	switch msg.Type {
	case Subscribe:
		c.handleSubscribe(msg)
	case Unsubscribe:
		c.handleUnsubscribe(msg)
	case Presence:
		if c.presenceLimit.allow() {
			c.handlePresence(msg)
		}
	case Tp:
		c.handleTp(msg)
	case GlobalChat:
		if c.allowChat() {
			c.handleGlobalChat(msg)
		} else {
			c.sendClientError("You are sending global chat messages too quickly.", c.chatRetryAfter())
		}
	case Cursor:
		if c.cursorLimit.allow() {
			c.handleCursor(msg)
		}
	case Ping:
		// nothing - client keepalive only
	case VoiceControl:
		c.handleVoiceControlMsg(msg)
	case VoiceSignal:
		c.handleVoiceSignal(msg)
	case MediaAdd, MediaRemove, MediaAction, MediaEnded, MediaTransitionStart, MediaTransition, MediaHistoryClear, MediaSfx:
		c.Hub.mediaUpdates <- MediaUpdateAction{Client: c, Message: msg}
	case GrengoJobAction:
		c.handleGrengoJobAction(msg)
	case ApiRequest:
		c.handleApiRequest(msg)
	default:
		if c.broadcastLimit.allow() {
			c.Hub.Broadcast(&msg)
		}
	}
}

func (c *Client) handleApiRequest(msg Message) {
	if c.Hub.ApiDispatcher == nil {
		pkgLog.Printf("[DEBUG] ApiDispatcher is nil")
		return
	}

	var req wspb.ApiRequest
	if err := proto.Unmarshal(msg.Payload, &req); err != nil {
		pkgLog.Printf("[ERROR] Failed to unmarshal ApiRequest: %v", err)
		return
	}

	go c.dispatchApiRequest(&req)
}

func (c *Client) dispatchApiRequest(req *wspb.ApiRequest) {
	route := req.Route
	if !strings.HasPrefix(route, "/api") {
		route = "/api" + route
	}

	pkgLog.Printf("[DEBUG] Dispatching WS API request: %s %s (requestId: %d)", req.Method, route, req.RequestId)

	httpReq, err := http.NewRequest(req.Method, route, bytes.NewReader(req.Body))
	if err != nil {
		pkgLog.Printf("[ERROR] Failed to create http request for route %s: %v", route, err)
		return
	}

	for k, v := range req.Headers {
		lk := strings.ToLower(k)
		if lk == "x-real-ip" || lk == "x-forwarded-for" || lk == "cf-connecting-ip" || lk == "x-forwarded-host" || lk == "x-forwarded-proto" {
			continue
		}
		httpReq.Header.Set(k, v)
	}

	if c.RealIP != "" {
		httpReq.Header.Set("X-Real-IP", c.RealIP)
	}

	// Important: Do not carry over cookies from websocket upgrade directly, 
	// because chi mux handles CORS/Auth via headers which frontend injects in the batch.
	rec := httptest.NewRecorder()
	c.Hub.ApiDispatcher.ServeHTTP(rec, httpReq)

	res := &wspb.ApiResponse{
		RequestId: req.RequestId,
		Status:    uint32(rec.Code),
		Body:      rec.Body.Bytes(),
	}
	resBytes, _ := proto.Marshal(res)

	c.queueMessage(&Message{
		Type:    "api:response",
		Payload: resBytes,
	})
}

func (c *Client) handleGrengoJobAction(msg Message) {
	var req struct {
		RequestID string `json:"request_id"`
	}
	_ = json.Unmarshal(msg.Payload, &req)

	go func() {
		var jobID string
		var err error
		if c.Hub.GrengoActionHandler == nil {
			err = errors.New("grengo action handler is not configured")
		} else {
			jobID, err = c.Hub.GrengoActionHandler(msg.Payload)
		}

		payload := map[string]any{
			"request_id": req.RequestID,
			"accepted":   err == nil,
			"job_id":     jobID,
		}
		if err != nil {
			payload["error"] = err.Error()
		}
		data, marshalErr := json.Marshal(payload)
		if marshalErr != nil {
			return
		}
		if !c.queueMessage(&Message{Type: GrengoActionAck, Payload: data}) {
			return
		}
	}()
}

// WritePump pumps encoded outbound messages from the hub to the connection and
// periodically sends WebSocket pings. If a ping fails or the send channel
// is closed, the connection is torn down.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		case data, ok := <-c.Send:
			if !ok {
				// Hub closed the channel.
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Internal helpers

func (c *Client) handleSubscribe(msg Message) {
	var payload map[string]interface{}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	resourceType, ok := payload["resource_type"].(string)
	if !ok {
		return
	}
	rid, ok := parseResourceID(payload["resource_id"])
	if !ok {
		return
	}
	c.Hub.Subscribe(c, resourceType, rid)
	log.Printf("ws: client %p subscribed to %s:%d", c, resourceType, rid)
}

func (c *Client) handleUnsubscribe(msg Message) {
	var payload map[string]interface{}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		return
	}
	resourceType, ok := payload["resource_type"].(string)
	if !ok {
		return
	}
	rid, ok := parseResourceID(payload["resource_id"])
	if !ok {
		return
	}
	c.Hub.Unsubscribe(c, resourceType, rid)
	log.Printf("ws: client %p unsubscribed from %s:%d", c, resourceType, rid)
}

// handlePresence forwards a presence announcement to the hub for processing.
func (c *Client) handlePresence(msg Message) {
	type presencePayload struct {
		Route          string `json:"route"`
		UserName       string `json:"user_name"`
		Avatar         string `json:"avatar"`
		IsMuted        bool   `json:"is_muted"`
		GuestSessionID string `json:"guest_session_id"`
	}

	var p presencePayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return
	}
	select {
	case c.Hub.presenceUpdates <- ClientPresence{Client: c, Route: p.Route, UserName: p.UserName, Avatar: p.Avatar, IsMuted: p.IsMuted, GuestSessionID: p.GuestSessionID}:
	default:
	}
}

// handleCursor forwards a cursor position update to the hub for same-route broadcast.
func (c *Client) handleCursor(msg Message) {
	type cursorPayload struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	var p cursorPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return
	}
	// Clamp to [0, 1].
	if p.X < 0 {
		p.X = 0
	} else if p.X > 1 {
		p.X = 1
	}
	if p.Y < 0 {
		p.Y = 0
	} else if p.Y > 1 {
		p.Y = 1
	}
	select {
	case c.Hub.cursorUpdates <- CursorBroadcast{Client: c, X: p.X, Y: p.Y}:
	default:
	}
}

// handleTp forwards a teleport request to the hub for targeted routing.
func (c *Client) handleTp(msg Message) {
	// Only authenticated users may send tp messages.
	if c.UserID == 0 {
		return
	}
	type tpPayload struct {
		TargetUserID int64  `json:"target_user_id"`
		Route        string `json:"route"`
	}
	var p tpPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return
	}
	if p.Route == "" || p.TargetUserID == 0 {
		return
	}
	c.Hub.SendTeleport(p.TargetUserID, p.Route)
}

// handleVoiceControlMsg forwards admin voice control actions to the hub.
func (c *Client) handleVoiceControlMsg(msg Message) {
	var p VoiceControlPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil {
		return
	}
	if p.Route == "" || p.Action == "" {
		return
	}
	if !c.HasPermission("home.manage") {
		c.sendClientErrorAction("forbidden", "You do not have permission to manage route voice chat.", 0)
		return
	}
	select {
	case c.Hub.voiceControl <- VoiceControlAction{Client: c, Payload: p}:
	default:
	}
}

// handleGlobalChat validates and enqueues a global chat message from this client.
func (c *Client) handleGlobalChat(msg Message) {
	type chatPayload struct {
		Content string `json:"content"`
	}
	var p chatPayload
	if err := json.Unmarshal(msg.Payload, &p); err != nil || len(p.Content) == 0 {
		return
	}
	// Truncate very long messages.
	if len(p.Content) > 500 {
		p.Content = p.Content[:500]
	}

	isGuest := c.UserID == 0
	userID := c.UserID
	if isGuest {
		userID = -c.ClientID
	}

	name := c.UserName
	if name == "" {
		if isGuest {
			name = "Guest"
		} else {
			name = "User"
		}
	}

	now := time.Now()
	c.Hub.SendGlobalChat(GlobalChatMessage{
		UserID:         userID,
		UserName:       name,
		Avatar:         c.Avatar,
		Roles:          c.Roles,
		Content:        p.Content,
		CreatedAt:      now.UTC().Format(time.RFC3339),
		IsGuest:        isGuest,
		Kind:           "message",
		GuestSessionID: c.GuestSessionID,
		SessionID:      c.SessionID,
	})
}

// allowChat returns true if this client is permitted to send a global chat message
// right now. It respects the hub's dynamic slow-mode setting; when slow mode is
// disabled it falls back to the per-client token bucket.
func (c *Client) allowChat() bool {
	if c.Hub.chatSlowModeEnabled.Load() {
		interval := c.Hub.chatSlowModeInterval.Load()
		if interval < 1 {
			interval = 10
		}
		now := time.Now()
		if now.Sub(c.lastChatAt) < time.Duration(interval)*time.Second {
			return false
		}
		c.lastChatAt = now
		return true
	}
	return c.chatLimit.allow()
}

// chatRetryAfter returns how long the client should wait before sending another
// global chat message.
func (c *Client) chatRetryAfter() time.Duration {
	if c.Hub.chatSlowModeEnabled.Load() {
		interval := c.Hub.chatSlowModeInterval.Load()
		if interval < 1 {
			interval = 10
		}
		wait := time.Duration(interval)*time.Second - time.Since(c.lastChatAt)
		if wait < 0 {
			wait = 0
		}
		return wait
	}
	return c.chatLimit.nextAvailable()
}

func (c *Client) sendClientError(message string, retryAfter time.Duration) {
	c.sendClientErrorAction("rate_limited", message, retryAfter)
}

func (c *Client) sendClientErrorAction(action string, message string, retryAfter time.Duration) {
	payload, err := json.Marshal(map[string]any{
		"action":      action,
		"message":     message,
		"retry_after": int(retryAfter.Seconds()),
	})
	if err != nil {
		return
	}
	c.queueMessage(&Message{Type: ErrorMessage, Payload: payload})
}

// subscriptionKey returns the canonical map key for a resource subscription.
func subscriptionKey(resourceType string, resourceID int64) string {
	return resourceType + ":" + strconv.FormatInt(resourceID, 10)
}

// parseResourceID accepts a JSON number (float64) or string.
func parseResourceID(v interface{}) (int64, bool) {
	switch val := v.(type) {
	case float64:
		return int64(val), true
	case string:
		if id, err := strconv.ParseInt(val, 10, 64); err == nil {
			return id, true
		}
	}
	return 0, false
}
