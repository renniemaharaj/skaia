package ws

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// Environment-driven configuration
// All values default to production-ready settings tuned for 100K concurrent
// connections. Override via environment variables.

// HubConfig holds runtime-tunable WebSocket hub settings read from the
// environment at startup. Use loadHubConfig() to populate.
type HubConfig struct {
	MaxConnections   int64
	MaxWorkers       int
	SessionSize      int
	ChatRingSize     int
	PresenceInterval time.Duration
}

// envInt reads key from the environment, returning def when absent or invalid.
func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		log.Printf("ws: invalid %s=%q, using default %d", key, v, def)
		return def
	}
	return n
}

// loadHubConfig reads hub tuning knobs from the environment.
func loadHubConfig() HubConfig {
	return HubConfig{
		MaxConnections:   int64(envInt("WS_MAX_CONNECTIONS", 100_000)),
		MaxWorkers:       envInt("WS_MAX_WORKERS", 256),
		SessionSize:      envInt("WS_SESSION_SIZE", 100),
		ChatRingSize:     envInt("WS_CHAT_RING_SIZE", 80),
		PresenceInterval: time.Duration(envInt("WS_PRESENCE_INTERVAL_MS", 1000)) * time.Millisecond,
	}
}

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

// sessionChatRing is a per-session circular buffer for chat history.
type sessionChatRing struct {
	ring  []GlobalChatMessage
	head  int
	count int
	size  int
}

func newSessionChatRing(size int) *sessionChatRing {
	return &sessionChatRing{ring: make([]GlobalChatMessage, size), size: size}
}

func (r *sessionChatRing) push(msg GlobalChatMessage) {
	r.ring[r.head] = msg
	r.head = (r.head + 1) % r.size
	if r.count < r.size {
		r.count++
	}
}

func (r *sessionChatRing) history() []GlobalChatMessage {
	if r.count == 0 {
		return nil
	}
	start := (r.head - r.count + r.size) % r.size
	out := make([]GlobalChatMessage, r.count)
	for i := 0; i < r.count; i++ {
		out[i] = r.ring[(start+i)%r.size]
	}
	return out
}

// Hub manages WebSocket connections and resource subscriptions.
// Run dispatches work to a bounded worker pool; shared state is protected
// by the mutexes documented on each field group.
type Hub struct {
	cfg HubConfig

	// NotificationFetcher, when set, is called on every authenticated client
	// connect to deliver a bootstrap notification payload.  Set once at startup
	// before the first connection arrives.
	NotificationFetcher func(userID int64) interface{}

	// channels
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

	// clients + subscriptions — protected by mu
	mu sync.RWMutex

	// worker pool
	workerSem chan struct{}

	// per-session chat ring buffers — protected by chatMu
	chatMu     sync.Mutex
	chatRings  map[int64]*sessionChatRing // sessionID → ring
	nextChatID int64

	// sessions — protected by sessionMu
	sessionMu   sync.Mutex
	sessions    map[int64]int // sessionID → active client count
	nextSession int64

	// monotonic client ID
	nextClientID atomic.Int64

	// active connection counter
	connCount atomic.Int64

	// presence coalescing
	presenceDirty atomic.Int32
}

// NewHub creates and initialises a Hub ready to be started with Run.
func NewHub() *Hub {
	cfg := loadHubConfig()
	log.Printf("ws: hub config — max_conn=%d workers=%d session_size=%d chat_ring=%d presence_ms=%d",
		cfg.MaxConnections, cfg.MaxWorkers, cfg.SessionSize, cfg.ChatRingSize, cfg.PresenceInterval.Milliseconds())
	return &Hub{
		cfg:             cfg,
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
		sessions:        make(map[int64]int),
		chatRings:       make(map[int64]*sessionChatRing),
		workerSem:       make(chan struct{}, cfg.MaxWorkers),
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
// Fan-out work is dispatched to a bounded worker pool so that slow
// broadcasts never spawn unbounded goroutines. Presence broadcasts are
// coalesced: rapid changes set a dirty flag and a background ticker
// fires the actual broadcast at most once per cfg.PresenceInterval.
func (h *Hub) Run() {
	// Presence debounce: a background ticker checks the dirty flag and
	// broadcasts at most once per cfg.PresenceInterval.
	go func() {
		ticker := time.NewTicker(h.cfg.PresenceInterval)
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
				h.sendNotificationBootstrap(client)
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

// Public API

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
