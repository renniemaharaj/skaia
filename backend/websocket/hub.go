package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/skaia/backend/models"
)

// MessageType defines the type of WebSocket message
type MessageType string

const (
	StoreSync   MessageType = "store:sync"
	StoreUpdate MessageType = "store:update"
	ForumSync   MessageType = "forum:sync"
	ForumUpdate MessageType = "forum:update"
	UserUpdate  MessageType = "user:update"
	UserJoin    MessageType = "user:join"
	UserLeave   MessageType = "user:leave"
	Subscribe   MessageType = "subscribe"
	Unsubscribe MessageType = "unsubscribe"
)

// Message represents a WebSocket message
type Message struct {
	Type    MessageType     `json:"type"`
	UserID  int64           `json:"user_id,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

// StorePayload for store updates
type StorePayload struct {
	Cart       []*models.CartItem      `json:"cart,omitempty"`
	Products   []*models.Product       `json:"products,omitempty"`
	Categories []*models.StoreCategory `json:"categories,omitempty"`
}

// ForumPayload for forum updates
type ForumPayload struct {
	Threads []*models.ForumThread `json:"threads,omitempty"`
	Posts   []*models.ForumPost   `json:"posts,omitempty"`
}

// ResourceSubscription tracks a client's interest in a specific resource
type ResourceSubscription struct {
	Client       *Client // The client that is subscribed
	ResourceType string  // "user", "forum_category"
	ResourceID   int64   // The specific resource ID
}

// Hub manages WebSocket connections and resource subscriptions
type Hub struct {
	clients       map[*Client]bool
	broadcast     chan *Message
	register      chan *Client
	unregister    chan *Client
	subscriptions map[string][]*Client // key: "resource_type:resource_id", value: list of subscribed clients
	subscribe     chan ResourceSubscription
	unsubscribe   chan ResourceSubscription
	mu            sync.RWMutex
}

// Client represents a WebSocket connection
type Client struct {
	Hub    *Hub
	Conn   *websocket.Conn
	Send   chan *Message
	UserID int64
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		clients:       make(map[*Client]bool),
		broadcast:     make(chan *Message, 256),
		register:      make(chan *Client, 256),
		unregister:    make(chan *Client, 256),
		subscriptions: make(map[string][]*Client),
		subscribe:     make(chan ResourceSubscription, 256),
		unsubscribe:   make(chan ResourceSubscription, 256),
	}
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client registered: UserID=%d", client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
				// Clean up all subscriptions for this client
				for key := range h.subscriptions {
					clients := make([]*Client, 0)
					for _, c := range h.subscriptions[key] {
						if c != client {
							clients = append(clients, c)
						}
					}
					if len(clients) == 0 {
						delete(h.subscriptions, key)
					} else {
						h.subscriptions[key] = clients
					}
				}
			}
			h.mu.Unlock()
			log.Printf("Client unregistered: UserID=%d", client.UserID)

		case sub := <-h.subscribe:
			h.mu.Lock()
			key := makeSubscriptionKey(sub.ResourceType, sub.ResourceID)
			h.subscriptions[key] = append(h.subscriptions[key], sub.Client)
			h.mu.Unlock()
			log.Printf("Client subscribed to %s", key)

		case unsub := <-h.unsubscribe:
			h.mu.Lock()
			key := makeSubscriptionKey(unsub.ResourceType, unsub.ResourceID)
			if clients, exists := h.subscriptions[key]; exists {
				filtered := make([]*Client, 0)
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
			}
			h.mu.Unlock()
			log.Printf("Client unsubscribed from %s", key)

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					// Client's send channel is full, close it
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(msg *Message) {
	select {
	case h.broadcast <- msg:
	default:
		log.Println("Broadcast channel full")
	}
}

// RegisterClient registers a new client with the hub
func (h *Hub) RegisterClient(client *Client) {
	select {
	case h.register <- client:
	default:
		log.Println("Register channel full")
	}
}

// RegisterRoutes registers WebSocket routes
func RegisterRoutes(r chi.Router, hub *Hub) {
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		HandleConnection(w, r, hub)
	})
}

// HandleConnection handles new WebSocket connections
func HandleConnection(w http.ResponseWriter, r *http.Request, hub *Hub) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins in development
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		Hub:  hub,
		Conn: conn,
		Send: make(chan *Message, 256),
	}

	hub.register <- client

	go client.ReadPump()
	go client.WritePump()
}

// ReadPump reads messages from the WebSocket connection
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Time{})
	for {
		var msg Message
		err := c.Conn.ReadJSON(&msg)
		if err != nil {
			return
		}

		c.UserID = msg.UserID

		// Handle subscription messages from client
		if msg.Type == Subscribe {
			var payload map[string]interface{}
			json.Unmarshal(msg.Payload, &payload)
			if resourceType, ok := payload["resource_type"].(string); ok {
				if resourceID, ok := payload["resource_id"].(float64); ok {
					c.Hub.Subscribe(c, resourceType, int64(resourceID))
					log.Printf("Client subscribed to %s:%d", resourceType, int64(resourceID))
					continue
				}
			}
		}

		// Handle unsubscription messages from client
		if msg.Type == Unsubscribe {
			var payload map[string]interface{}
			json.Unmarshal(msg.Payload, &payload)
			if resourceType, ok := payload["resource_type"].(string); ok {
				if resourceID, ok := payload["resource_id"].(float64); ok {
					c.Hub.Unsubscribe(c, resourceType, int64(resourceID))
					log.Printf("Client unsubscribed from %s:%d", resourceType, int64(resourceID))
					continue
				}
			}
		}

		// Broadcast other messages to all clients (if needed)
		c.Hub.Broadcast(&msg)
	}
}

// WritePump writes messages to the WebSocket connection
func (c *Client) WritePump() {
	for message := range c.Send {
		w, err := c.Conn.NextWriter(websocket.TextMessage)
		if err != nil {
			return
		}

		json.NewEncoder(w).Encode(message)
		w.Close()
	}
	c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
}

// makeSubscriptionKey creates a unique key for a resource subscription
func makeSubscriptionKey(resourceType string, resourceID int64) string {
	return resourceType + ":" + strconv.FormatInt(resourceID, 10)
}

// Subscribe adds a client subscription to a resource
func (h *Hub) Subscribe(client *Client, resourceType string, resourceID int64) {
	h.subscribe <- ResourceSubscription{
		Client:       client,
		ResourceType: resourceType,
		ResourceID:   resourceID,
	}
}

// Unsubscribe removes a client subscription from a resource
func (h *Hub) Unsubscribe(client *Client, resourceType string, resourceID int64) {
	h.unsubscribe <- ResourceSubscription{
		Client:       client,
		ResourceType: resourceType,
		ResourceID:   resourceID,
	}
}

// PropagateUser sends user data to all clients that have requested this user
func (h *Hub) PropagateUser(userID int64, userData interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	key := makeSubscriptionKey("user", userID)
	if clients, exists := h.subscriptions[key]; exists {
		payload, _ := json.Marshal(map[string]interface{}{
			"action": "user_updated",
			"id":     userID,
			"data":   userData,
		})

		message := &Message{
			Type:    UserUpdate,
			Payload: payload,
		}

		for _, client := range clients {
			select {
			case client.Send <- message:
			default:
				log.Printf("Failed to send propagation to client UserID=%d", client.UserID)
			}
		}
	}
}

// PropagateForumCategories sends forum category data to subscribed clients
func (h *Hub) PropagateForumCategories(categoryID int64, data interface{}, action string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	key := makeSubscriptionKey("forum_category", categoryID)
	if clients, exists := h.subscriptions[key]; exists {
		payload, _ := json.Marshal(map[string]interface{}{
			"action": action,
			"id":     categoryID,
			"data":   data,
		})

		message := &Message{
			Type:    ForumUpdate,
			Payload: payload,
		}

		for _, client := range clients {
			select {
			case client.Send <- message:
			default:
				log.Printf("Failed to send forum propagation to client UserID=%d", client.UserID)
			}
		}
	}
}

// PropagateToAll sends a message to all subscribed clients of a resource type
func (h *Hub) PropagateToAll(resourceType string, data interface{}, action string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for key, clients := range h.subscriptions {
		if len(key) > len(resourceType) && key[:len(resourceType)] == resourceType {
			payload, _ := json.Marshal(map[string]interface{}{
				"action": action,
				"data":   data,
			})

			msgType := MessageType(resourceType + ":update")
			message := &Message{
				Type:    msgType,
				Payload: payload,
			}

			for _, client := range clients {
				select {
				case client.Send <- message:
				default:
					log.Printf("Failed to send propagation to client UserID=%d", client.UserID)
				}
			}
		}
	}
}
