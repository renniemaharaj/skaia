package ws

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// TODO: restrict allowed origins in production.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// RegisterRoutes mounts the /ws endpoint on r.
func RegisterRoutes(r chi.Router, hub *Hub) {
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		HandleConnection(w, r, hub)
	})
}

// HandleConnection upgrades an HTTP request to a WebSocket connection and
// registers the resulting client with hub.
func HandleConnection(w http.ResponseWriter, r *http.Request, hub *Hub) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: upgrade error: %v", err)
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
