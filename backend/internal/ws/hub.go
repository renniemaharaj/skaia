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
	mu              sync.RWMutex
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
	}
}

// clientLabel returns a human-readable string for a Client suitable for log output.
func clientLabel(c *Client) string {
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
		}
	}
}

// ── Run case handlers ────────────────────────────────────────────────────────

func (h *Hub) handleRegister(client *Client) {
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
	// Deduplicate by UserID — if the same user has multiple connections
	// (e.g. tab reload before old socket closes) keep the one with a name.
	seen := make(map[int64]PresenceUser)
	for client := range h.clients {
		pu := PresenceUser{
			UserID:   client.UserID,
			UserName: client.UserName,
			Avatar:   client.Avatar,
			Route:    client.Route,
		}
		existing, ok := seen[client.UserID]
		if !ok || (pu.UserName != "" && existing.UserName == "") {
			seen[client.UserID] = pu
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

// ── Public API ───────────────────────────────────────────────────────────────

// Broadcast enqueues a message for delivery to all connected clients.
func (h *Hub) Broadcast(msg *Message) {
	select {
	case h.broadcast <- msg:
	default:
		log.Println("ws: broadcast channel full, message dropped")
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
