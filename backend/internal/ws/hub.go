package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
)

// ClientPresence carries a presence announcement from a client, processed in Run.
type ClientPresence struct {
	Client   *Client
	Route    string
	UserName string
	Avatar   string
}

// TeleportRequest asks the hub to forward a tp message to a specific user.
type TeleportRequest struct {
	TargetUserID int64  // positive for authenticated users, negative (presence ID) for guests
	Route        string // route the target should navigate to
}

// globalChatRingSize is the maximum number of global chat messages kept in memory.
const globalChatRingSize = 80

// Hub manages WebSocket connections and resource subscriptions.
// All channel operations are serialised through Run; field access outside
// Run is protected by mu.
type Hub struct {
	clients         map[*Client]bool
	broadcast       chan *Message
	register        chan *Client
	unregister      chan *Client
	subscriptions   map[string][]*Client // key: "resource_type:resource_id"
	subscribe       chan ResourceSubscription
	unsubscribe     chan ResourceSubscription
	presenceUpdates chan ClientPresence
	teleport        chan TeleportRequest
	// Global chat ring buffer — written only from Run goroutine.
	globalChat   chan GlobalChatMessage
	chatRing     [globalChatRingSize]GlobalChatMessage
	chatHead     int // next write position (ring)
	chatCount    int // total messages stored (capped at globalChatRingSize)
	nextChatID   int64
	nextClientID int64 // monotonic counter, incremented only in Run
	mu           sync.RWMutex
}

// NewHub creates and initialises a Hub ready to be started with Run.
func NewHub() *Hub {
	return &Hub{
		clients:         make(map[*Client]bool),
		broadcast:       make(chan *Message, 256),
		register:        make(chan *Client, 256),
		unregister:      make(chan *Client, 256),
		subscriptions:   make(map[string][]*Client),
		subscribe:       make(chan ResourceSubscription, 256),
		unsubscribe:     make(chan ResourceSubscription, 256),
		presenceUpdates: make(chan ClientPresence, 256),
		teleport:        make(chan TeleportRequest, 256),
		globalChat:      make(chan GlobalChatMessage, 256),
	}
}

// clientLabel returns a human-readable string for a Client suitable for log output.
func clientLabel(c *Client) string {
	if c.UserID == 0 {
		return fmt.Sprintf("guest (conn=%d)", c.ClientID)
	}
	if c.UserName != "" {
		return fmt.Sprintf("%q (id=%d)", c.UserName, c.UserID)
	}
	return fmt.Sprintf("id=%d", c.UserID)
}

// Run is the hub's event loop. Start it in a dedicated goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.handleRegister(client)
			h.sendChatHistory(client)
			h.doPresenceBroadcast()
		case client := <-h.unregister:
			h.handleUnregister(client)
			h.doPresenceBroadcast()
		case sub := <-h.subscribe:
			h.handleSubscribe(sub)
		case unsub := <-h.unsubscribe:
			h.handleUnsubscribe(unsub)
		case msg := <-h.broadcast:
			h.handleBroadcast(msg)
		case cp := <-h.presenceUpdates:
			cp.Client.Route = cp.Route
			cp.Client.UserName = cp.UserName
			cp.Client.Avatar = cp.Avatar
			h.doPresenceBroadcast()
		case req := <-h.teleport:
			h.handleTeleport(req)
		case cm := <-h.globalChat:
			h.handleGlobalChat(cm)
		}
	}
}

// ── Run case handlers ────────────────────────────────────────────────────────

func (h *Hub) handleRegister(client *Client) {
	h.nextClientID++
	client.ClientID = h.nextClientID
	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()
	log.Printf("ws: joined  %s", clientLabel(client))
}

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return
	}

	delete(h.clients, client)
	close(client.Send)

	// Remove all subscriptions for this client.
	for key, clients := range h.subscriptions {
		filtered := make([]*Client, 0, len(clients))
		for _, c := range clients {
			if c != client {
				filtered = append(filtered, c)
			}
		}
		if len(filtered) == 0 {
			delete(h.subscriptions, key)
		} else {
			h.subscriptions[key] = filtered
		}
	}
	log.Printf("ws: left    %s", clientLabel(client))
}

func (h *Hub) handleSubscribe(sub ResourceSubscription) {
	h.mu.Lock()
	key := subscriptionKey(sub.ResourceType, sub.ResourceID)
	h.subscriptions[key] = append(h.subscriptions[key], sub.Client)
	h.mu.Unlock()
	log.Printf("ws: sub     %s → %s", clientLabel(sub.Client), key)
}

func (h *Hub) handleUnsubscribe(unsub ResourceSubscription) {
	h.mu.Lock()
	defer h.mu.Unlock()

	key := subscriptionKey(unsub.ResourceType, unsub.ResourceID)
	clients, exists := h.subscriptions[key]
	if !exists {
		return
	}

	filtered := make([]*Client, 0, len(clients))
	for _, c := range clients {
		if c != unsub.Client {
			filtered = append(filtered, c)
		}
	}
	if len(filtered) == 0 {
		delete(h.subscriptions, key)
	} else {
		h.subscriptions[key] = filtered
	}
	log.Printf("ws: client %p unsubscribed from %s", unsub.Client, key)
}

// handleBroadcast fans a message out to every connected client.
// Clients whose send channel is full are evicted.
func (h *Hub) handleBroadcast(msg *Message) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		select {
		case client.Send <- msg:
		default:
			// Send buffer full — drop the client.
			close(client.Send)
			delete(h.clients, client)
		}
	}
}

// doPresenceBroadcast builds the current online user list and sends it to every
// connected client. Must only be called from the Run goroutine.
func (h *Hub) doPresenceBroadcast() {
	h.mu.RLock()
	// Authenticated users: deduplicate by UserID, prefer entry with a name.
	// Guests: each connection is unique — use a negative ClientID as their presence ID.
	seen := make(map[int64]PresenceUser)
	for client := range h.clients {
		var presenceID int64
		if client.UserID == 0 {
			presenceID = -client.ClientID // unique negative ID per guest connection
		} else {
			presenceID = client.UserID
		}
		pu := PresenceUser{
			UserID:   presenceID,
			UserName: client.UserName,
			Avatar:   client.Avatar,
			Route:    client.Route,
		}
		existing, ok := seen[presenceID]
		if !ok || (pu.UserName != "" && existing.UserName == "") {
			seen[presenceID] = pu
		}
	}
	users := make([]PresenceUser, 0, len(seen))
	for _, u := range seen {
		if len(users) >= 100 {
			break
		}
		users = append(users, u)
	}
	h.mu.RUnlock()

	payload, _ := json.Marshal(map[string]interface{}{
		"action": "presence_updated",
		"users":  users,
	})
	msg := &Message{Type: PresenceSync, Payload: payload}

	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.clients {
		select {
		case client.Send <- msg:
		default:
			close(client.Send)
			delete(h.clients, client)
		}
	}
}

// handleTeleport routes a tp message to every connection matching TargetUserID.
// For authenticated users TargetUserID == UserID; for guests it equals -ClientID.
func (h *Hub) handleTeleport(req TeleportRequest) {
	payload, _ := json.Marshal(map[string]interface{}{"route": req.Route})
	msg := &Message{Type: Tp, Payload: payload}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		var presenceID int64
		if client.UserID == 0 {
			presenceID = -client.ClientID
		} else {
			presenceID = client.UserID
		}
		if presenceID == req.TargetUserID {
			select {
			case client.Send <- msg:
			default:
				log.Printf("ws: tp send buffer full for userID=%d", client.UserID)
			}
		}
	}
}

// handleGlobalChat appends the message to the ring buffer and broadcasts it to all clients.
func (h *Hub) handleGlobalChat(cm GlobalChatMessage) {
	// Assign monotonic ID
	h.nextChatID++
	cm.ID = h.nextChatID

	// Write into ring
	h.chatRing[h.chatHead] = cm
	h.chatHead = (h.chatHead + 1) % globalChatRingSize
	if h.chatCount < globalChatRingSize {
		h.chatCount++
	}

	// Broadcast to all clients
	payload, _ := json.Marshal(cm)
	msg := &Message{Type: GlobalChat, Payload: payload}

	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.clients {
		select {
		case client.Send <- msg:
		default:
			close(client.Send)
			delete(h.clients, client)
		}
	}
}

// sendChatHistory delivers the recent global chat ring to a freshly connected client.
// Must only be called from the Run goroutine.
func (h *Hub) sendChatHistory(client *Client) {
	if h.chatCount == 0 {
		return
	}

	start := (h.chatHead - h.chatCount + globalChatRingSize) % globalChatRingSize
	history := make([]GlobalChatMessage, h.chatCount)
	for i := 0; i < h.chatCount; i++ {
		history[i] = h.chatRing[(start+i)%globalChatRingSize]
	}

	payload, _ := json.Marshal(map[string]interface{}{"messages": history})
	msg := &Message{Type: GlobalChatHistory, Payload: payload}
	select {
	case client.Send <- msg:
	default:
	}
}

// ── Public API ───────────────────────────────────────────────────────────────

// Broadcast enqueues a message for delivery to all connected clients.
func (h *Hub) Broadcast(msg *Message) {
	select {
	case h.broadcast <- msg:
	default:
		log.Println("ws: broadcast channel full, message dropped")
	}
}

// SendTeleport enqueues a teleport request so the hub routes it to the target.
func (h *Hub) SendTeleport(targetUserID int64, route string) {
	select {
	case h.teleport <- TeleportRequest{TargetUserID: targetUserID, Route: route}:
	default:
		log.Println("ws: teleport channel full, request dropped")
	}
}

// SendGlobalChat enqueues a global chat message.
func (h *Hub) SendGlobalChat(cm GlobalChatMessage) {
	select {
	case h.globalChat <- cm:
	default:
		log.Println("ws: global chat channel full, message dropped")
	}
}

// SendToUser delivers a targeted message to all connections authenticated as userID.
// Safe to call from any goroutine.
func (h *Hub) SendToUser(userID int64, msg *Message) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.UserID == userID {
			select {
			case client.Send <- msg:
			default:
				log.Printf("ws: send buffer full for userID=%d", userID)
			}
		}
	}
}

// RegisterClient registers a client with the hub.
func (h *Hub) RegisterClient(client *Client) {
	select {
	case h.register <- client:
	default:
		log.Println("ws: register channel full")
	}
}

// Subscribe requests that client receives updates for the given resource.
func (h *Hub) Subscribe(client *Client, resourceType string, resourceID int64) {
	h.subscribe <- ResourceSubscription{
		Client:       client,
		ResourceType: resourceType,
		ResourceID:   resourceID,
	}
}

// Unsubscribe removes client's subscription for the given resource.
func (h *Hub) Unsubscribe(client *Client, resourceType string, resourceID int64) {
	h.unsubscribe <- ResourceSubscription{
		Client:       client,
		ResourceType: resourceType,
		ResourceID:   resourceID,
	}
}

// ── Propagation helpers ──────────────────────────────────────────────────────

// PropagateUser sends updated user data to all clients subscribed to that user.
func (h *Hub) PropagateUser(userID int64, userData interface{}) {
	h.propagate("user", userID, UserUpdate, "user_updated", userData)
}

// PropagateForumCategories sends forum category data to subscribed clients.
func (h *Hub) PropagateForumCategories(categoryID int64, data interface{}, action string) {
	h.propagate("forum_category", categoryID, ForumUpdate, action, data)
}

// PropagateForumThread sends forum thread data to subscribed clients.
func (h *Hub) PropagateForumThread(threadID int64, data interface{}, action string) {
	h.propagate("thread", threadID, ForumUpdate, action, data)
}

// PropagateInboxConversation sends an inbox message event to all clients subscribed to a conversation.
func (h *Hub) PropagateInboxConversation(conversationID int64, data interface{}, action string) {
	h.propagate("inbox_conversation", conversationID, InboxUpdate, action, data)
}

// propagate is the shared implementation used by all Propagate* helpers.
func (h *Hub) propagate(resourceType string, resourceID int64, msgType MessageType, action string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	key := subscriptionKey(resourceType, resourceID)
	clients, exists := h.subscriptions[key]
	if !exists {
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"id":     resourceID,
		"data":   data,
	})
	msg := &Message{Type: msgType, Payload: payload}

	for _, client := range clients {
		select {
		case client.Send <- msg:
		default:
			log.Printf("ws: send buffer full, dropping message for userID=%d", client.UserID)
		}
	}
}

// PropagateToAll sends a message to every client subscribed to any key that
// starts with resourceType (e.g. "store" matches "store:1", "store:2").
func (h *Hub) PropagateToAll(resourceType string, data interface{}, action string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"data":   data,
	})
	msg := &Message{
		Type:    MessageType(resourceType + ":update"),
		Payload: payload,
	}

	prefix := resourceType + ":"
	for key, clients := range h.subscriptions {
		if len(key) <= len(prefix) || key[:len(prefix)] != prefix {
			continue
		}
		for _, client := range clients {
			select {
			case client.Send <- msg:
			default:
				log.Printf("ws: send buffer full, dropping message for userID=%d", client.UserID)
			}
		}
	}
}
