package ws

import (
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"
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
	// maxWorkers limits concurrent fan-out goroutines in the hub's worker pool.
	maxWorkers = 64
	// presenceInterval is the minimum interval between coalesced presence broadcasts.
	presenceInterval = 1 * time.Second
)

// Hub manages WebSocket connections and resource subscriptions.
// Run dispatches work to a bounded worker pool; shared state is protected
// by the mutexes documented on each field group.
type Hub struct {
	// ── channels ────────────────────────────────────────────────────────────
	clients         map[*Client]bool
	broadcast       chan *Message
	register        chan *Client
	unregister      chan *Client
	subscriptions   map[string][]*Client        // key: "resource_type:resource_id"
	clientSubs      map[*Client]map[string]bool // reverse index: client → subscription keys
	subscribe       chan ResourceSubscription
	unsubscribe     chan ResourceSubscription
	presenceUpdates chan ClientPresence
	teleport        chan TeleportRequest
	cursorUpdates   chan CursorBroadcast
	globalChat      chan GlobalChatMessage

	// ── clients + subscriptions — protected by mu ────────────────────────
	mu sync.RWMutex

	// ── worker pool — caps concurrent fan-out goroutines ─────────────────
	workerSem chan struct{}

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

	// ── presence coalescing — accessed via atomic ─────────────────────────
	presenceDirty atomic.Int32
}

// NewHub creates and initialises a Hub ready to be started with Run.
func NewHub() *Hub {
	return &Hub{
		clients:         make(map[*Client]bool),
		broadcast:       make(chan *Message, 2048),
		register:        make(chan *Client, 2048),
		unregister:      make(chan *Client, 2048),
		subscriptions:   make(map[string][]*Client),
		clientSubs:      make(map[*Client]map[string]bool),
		subscribe:       make(chan ResourceSubscription, 1024),
		unsubscribe:     make(chan ResourceSubscription, 1024),
		presenceUpdates: make(chan ClientPresence, 4096),
		teleport:        make(chan TeleportRequest, 256),
		globalChat:      make(chan GlobalChatMessage, 1024),
		cursorUpdates:   make(chan CursorBroadcast, 2048),
		cursorSessions:  make(map[int64]int),
		workerSem:       make(chan struct{}, maxWorkers),
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
// Fan-out work is dispatched to a bounded worker pool (maxWorkers) so
// that slow broadcasts never spawn unbounded goroutines. Presence
// broadcasts are coalesced: rapid changes set a dirty flag and a
// background ticker fires the actual broadcast at most once per
// presenceInterval.
func (h *Hub) Run() {
	// Presence debounce: a background ticker checks the dirty flag and
	// broadcasts at most once per presenceInterval.
	go func() {
		ticker := time.NewTicker(presenceInterval)
		defer ticker.Stop()
		for range ticker.C {
			if h.presenceDirty.CompareAndSwap(1, 0) {
				h.dispatch(h.doPresenceBroadcast)
			}
		}
	}()

	for {
		select {
		case client := <-h.register:
			h.dispatch(func() {
				h.handleRegister(client)
				h.sendChatHistory(client)
				h.markPresenceDirty()
			})
		case client := <-h.unregister:
			h.dispatch(func() {
				h.handleUnregister(client)
				h.markPresenceDirty()
			})
		case sub := <-h.subscribe:
			h.handleSubscribe(sub) // fast map write — run inline
		case unsub := <-h.unsubscribe:
			h.handleUnsubscribe(unsub) // fast map write — run inline
		case msg := <-h.broadcast:
			h.dispatch(func() { h.handleBroadcast(msg) })
		case cp := <-h.presenceUpdates:
			h.dispatch(func() {
				// Write client presence fields under mu so concurrent
				// readers in doPresenceBroadcast / handleCursorBroadcast
				// always see a consistent snapshot.
				h.mu.Lock()
				cp.Client.Route = cp.Route
				cp.Client.UserName = cp.UserName
				cp.Client.Avatar = cp.Avatar
				h.mu.Unlock()
				h.markPresenceDirty()
			})
		case req := <-h.teleport:
			h.dispatch(func() { h.handleTeleport(req) })
		case cu := <-h.cursorUpdates:
			h.dispatch(func() { h.handleCursorBroadcast(cu) })
		case cm := <-h.globalChat:
			h.dispatch(func() { h.handleGlobalChat(cm) })
		}
	}
}

// dispatch runs fn on a pooled goroutine, blocking if all maxWorkers slots
// are occupied. This caps concurrent fan-out and provides natural back-pressure
// through the channel buffers.
func (h *Hub) dispatch(fn func()) {
	h.workerSem <- struct{}{}
	go func() {
		defer func() { <-h.workerSem }()
		fn()
	}()
}

// markPresenceDirty flags that a presence broadcast is needed. The background
// ticker in Run coalesces rapid changes into a single broadcast.
func (h *Hub) markPresenceDirty() {
	h.presenceDirty.Store(1)
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
