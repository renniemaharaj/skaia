package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
	UserJoin    MessageType = "user:join"
	UserLeave   MessageType = "user:leave"
)

// Message represents a WebSocket message
type Message struct {
	Type    MessageType     `json:"type"`
	UserID  uuid.UUID       `json:"user_id,omitempty"`
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

// Hub manages WebSocket connections
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan *Message
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// Client represents a WebSocket connection
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan *Message
	UserID uuid.UUID
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan *Message, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
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
			log.Printf("Client registered: %s", client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client unregistered: %s", client.UserID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Client's send channel is full, close it
					close(client.send)
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
		hub:  hub,
		conn: conn,
		send: make(chan *Message, 256),
	}

	hub.register <- client

	go client.readPump()
	go client.writePump()
}

// readPump reads messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Time{})
	for {
		var msg Message
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			return
		}

		c.UserID = msg.UserID
		c.hub.Broadcast(&msg)
	}
}

// writePump writes messages to the WebSocket connection
func (c *Client) writePump() {
	for message := range c.send {
		w, err := c.conn.NextWriter(websocket.TextMessage)
		if err != nil {
			return
		}

		json.NewEncoder(w).Encode(message)
		w.Close()
	}
	c.conn.WriteMessage(websocket.CloseMessage, []byte{})
}
