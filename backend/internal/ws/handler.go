package ws

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/skaia/backend/internal/auth"
)

const maxMessageSize = 4096

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     checkOrigin,
}

func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}

	// Check explicit CORS_ORIGINS first (exact match).
	if allowed := os.Getenv("CORS_ORIGINS"); allowed != "" {
		for _, o := range strings.Split(allowed, ",") {
			if strings.TrimSpace(o) == origin {
				return true
			}
		}
	}

	// Derive allowed origins from DOMAINS (accept both http and https, plus www. variants).
	if domains := os.Getenv("DOMAINS"); domains != "" {
		for _, d := range strings.Fields(domains) {
			if origin == "http://"+d || origin == "https://"+d {
				return true
			}
			if !strings.HasPrefix(d, "www.") {
				www := "www." + d
				if origin == "http://"+www || origin == "https://"+www {
					return true
				}
			}
		}
	}

	return false
}

// RegisterRoutes mounts the /ws endpoint on r.
func RegisterRoutes(r chi.Router, hub *Hub) {
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		HandleConnection(w, r, hub)
	})
}

// HandleConnection upgrades an HTTP request to a WebSocket connection
// and registers the resulting client with hub.
func HandleConnection(w http.ResponseWriter, r *http.Request, hub *Hub) {
	// authenticate via token query param or Authorization header
	var userID int64
	var userName string

	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		ah := r.Header.Get("Authorization")
		if strings.HasPrefix(ah, "Bearer ") {
			tokenStr = ah[7:]
		}
	}
	if tokenStr != "" {
		if claims, err := auth.ValidateToken(tokenStr); err == nil {
			userID = claims.UserID
			userName = claims.Username
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: upgrade error: %v", err)
		return
	}

	conn.SetReadLimit(maxMessageSize)

	chatRate := 5.0
	chatBurst := 5.0
	if envBoolDefault("WS_GLOBAL_CHAT_SLOWMODE_ENABLED", false) {
		interval := envIntDefault("WS_GLOBAL_CHAT_SLOWMODE_SECONDS", 10)
		chatRate = 1.0 / float64(interval)
		chatBurst = 1.0
	}

	client := &Client{
		Hub:            hub,
		Conn:           conn,
		Send:           make(chan *Message, 256),
		UserID:         userID,
		UserName:       userName,
		chatLimit:      newRateBucket(chatRate, chatBurst),
		cursorLimit:    newRateBucket(30, 30),
		presenceLimit:  newRateBucket(5, 5),
		broadcastLimit: newRateBucket(10, 10),
	}

	hub.register <- client

	go client.ReadPump()
	go client.WritePump()
}

func envIntDefault(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func envBoolDefault(key string, def bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return def
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}
