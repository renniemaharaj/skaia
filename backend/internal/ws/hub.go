package ws

import (
	"fmt"
	"log"
	"sync"
	"sync/atomic"
)

// ClientPresence carries a presence announcement from a client, processed in Run.
type ClientPresence struct {
	Client   *Client
	Route    string
	UserName string
	Avatar   string
}

// CursorBroadcast carries a cursor position from a client to be relayed to others on the same route.
type CursorBroadcast struct {
	Client *Client
	X      float64
	Y      float64
}

// TeleportRequest asks the hub to forward a tp message to a specific user.
type TeleportRequest struct {
	TargetUserID int64  // positive for authenticated users, negative (presence ID) for guests
	Route        string // route the target should navigate to
}

const (
	// globalChatRingSize is the maximum number of global chat messages kept in memory.
	globalChatRingSize = 80
	// cursorSessionSize caps how many clients share a cursor-presence session.
	// Cursor updates are only relayed within a session, bounding fan-out to O(cursorSessionSize).
	cursorSessionSize = 100
	// maxConnections is the total number of simultaneous WebSocket connections the hub will accept.
	// Registrations above this threshold are rejected immediately.
	maxConnections = 10_000
)

// Hub manages WebSocket connections and resource subscriptions.
// Run dispatches each case into its own goroutine; shared state is protected
// by the mutexes documented on each field group.
type Hub struct {
	// ── channels ────────────────────────────────────────────────────────────
	clients         map[*Client]bool
	broadcast       chan *Message
	register        chan *Client
	unregister      chan *Client
	subscriptions   map[string][]*Client // key: "resource_type:resource_id"
	subscribe       chan ResourceSubscription
	unsubscribe     chan ResourceSubscription
	presenceUpdates chan ClientPresence
	teleport        chan TeleportRequest
	cursorUpdates   chan CursorBroadcast
	globalChat      chan GlobalChatMessage

	// ── clients + subscriptions — protected by mu ────────────────────────
	mu sync.RWMutex

	// ── global chat ring buffer — protected by chatMu ────────────────────
	chatMu     sync.Mutex
	chatRing   [globalChatRingSize]GlobalChatMessage
	chatHead   int // next write position
	chatCount  int // messages stored (capped at globalChatRingSize)
	nextChatID int64

	// ── cursor sessions — protected by cursorSessionMu ───────────────────
	// Clients are bucketed into sessions of at most cursorSessionSize.
	// Cursor updates are only fanned out within the sender's session,
	// bounding per-update work regardless of total connection count.
	cursorSessionMu   sync.Mutex
	cursorSessions    map[int64]int // sessionID → active client count
	nextCursorSession int64

	// ── monotonic client ID — accessed via atomic ─────────────────────────
	nextClientID atomic.Int64

	// ── active connection counter — accessed via atomic ───────────────────
	connCount atomic.Int64
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
		cursorUpdates:   make(chan CursorBroadcast, 512),
		cursorSessions:  make(map[int64]int),
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
// Each case is dispatched into its own goroutine so that slow fan-outs
// (broadcasts, cursor relays, presence rebuilds) never stall the selector.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			go func(c *Client) {
				h.handleRegister(c)
				h.sendChatHistory(c)
				h.doPresenceBroadcast()
			}(client)
		case client := <-h.unregister:
			go func(c *Client) {
				h.handleUnregister(c)
				h.doPresenceBroadcast()
			}(client)
		case sub := <-h.subscribe:
			h.handleSubscribe(sub) // fast map write — run inline, no goroutine
		case unsub := <-h.unsubscribe:
			h.handleUnsubscribe(unsub) // fast map write — run inline, no goroutine
		case msg := <-h.broadcast:
			go h.handleBroadcast(msg)
		case cp := <-h.presenceUpdates:
			go func(p ClientPresence) {
				// Write client presence fields under mu so concurrent
				// readers in doPresenceBroadcast / handleCursorBroadcast
				// always see a consistent snapshot.
				h.mu.Lock()
				p.Client.Route = p.Route
				p.Client.UserName = p.UserName
				p.Client.Avatar = p.Avatar
				h.mu.Unlock()
				h.doPresenceBroadcast()
			}(cp)
		case req := <-h.teleport:
			go h.handleTeleport(req)
		case cu := <-h.cursorUpdates:
			go h.handleCursorBroadcast(cu)
		case cm := <-h.globalChat:
			go h.handleGlobalChat(cm)
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
	sub := ResourceSubscription{
		Client:       client,
		ResourceType: resourceType,
		ResourceID:   resourceID,
	}
	select {
	case h.subscribe <- sub:
	default:
		log.Println("ws: subscribe channel full, request dropped")
	}
}

// Unsubscribe removes client's subscription for the given resource.
func (h *Hub) Unsubscribe(client *Client, resourceType string, resourceID int64) {
	unsub := ResourceSubscription{
		Client:       client,
		ResourceType: resourceType,
		ResourceID:   resourceID,
	}
	select {
	case h.unsubscribe <- unsub:
	default:
		log.Println("ws: unsubscribe channel full, request dropped")
	}
}
