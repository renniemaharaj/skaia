package grengo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/skaia/backend/internal/ws"
)

// WatchJobs connects to the grengo WebSocket and broadcasts job updates to the frontend hub.
func (s *Service) WatchJobs() {
	wsURL := strings.Replace(s.apiURL, "http://", "ws://", 1) + "/ws"

	for {
		headers := make(http.Header)
		if s.passcode != "" {
			headers.Set("X-Grengo-Passcode", s.passcode)
		}
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
		if err != nil {
			fmt.Printf("grengo ws: failed to connect to %s: %v, retrying in 5s...\n", wsURL, err)
			time.Sleep(5 * time.Second)
			continue
		}
		fmt.Printf("grengo ws: connected to %s\n", wsURL)

		s.wsConnMu.Lock()
		s.wsConn = conn
		s.wsConnMu.Unlock()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				fmt.Printf("grengo ws: disconnected: %v\n", err)
				conn.Close()
				s.wsConnMu.Lock()
				if s.wsConn == conn {
					s.wsConn = nil
				}
				s.wsConnMu.Unlock()
				break
			}

			var parsed struct {
				Type    string          `json:"type"`
				Payload json.RawMessage `json:"payload"`
			}
			json.Unmarshal(msg, &parsed)

			msgType := ws.GrengoJobUpdate
			if parsed.Type == "stats_update" {
				msgType = ws.GrengoStatsUpdate
			} else if parsed.Type == "storage_update" {
				msgType = ws.GrengoStorageUpdate
			} else if parsed.Type == "hardware_update" {
				msgType = ws.GrengoHardwareUpdate
			}

			// Broadcast only the payload to frontend clients (not the full grengo envelope)
			broadcastPayload := parsed.Payload
			if broadcastPayload == nil {
				broadcastPayload = json.RawMessage(msg)
			}

			if s.hub != nil {
				s.hub.Broadcast(&ws.Message{
					Type:    msgType,
					Payload: broadcastPayload,
				})
			}
		}

		time.Sleep(5 * time.Second)
	}
}

// SendAction sends a command to grengo via the established WebSocket connection.
func (s *Service) SendAction(action []byte) {
	s.wsConnMu.Lock()
	defer s.wsConnMu.Unlock()
	if s.wsConn != nil {
		_ = s.wsConn.WriteMessage(websocket.TextMessage, action)
	}
}
