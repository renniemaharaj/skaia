package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// WebSocket & Background Jobs
// ---------------------------------------------------------------------------

type jobStatus struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`   // "export-node", "export-site"
	Status    string    `json:"status"` // "running", "completed", "failed"
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	filePath  string    // hidden from JSON
}

var (
	jobsMu sync.RWMutex
	jobs   = make(map[string]*jobStatus)

	wsClientsMu sync.Mutex
	wsClients   = make(map[*websocket.Conn]bool)
	wsUpgrader  = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

func apiWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	wsClientsMu.Lock()
	wsClients[conn] = true
	wsClientsMu.Unlock()

	defer func() {
		wsClientsMu.Lock()
		delete(wsClients, conn)
		wsClientsMu.Unlock()
		conn.Close()
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var req struct {
			Action  string   `json:"action"`
			Name    string   `json:"name"`
			Command string   `json:"command"`
			Args    []string `json:"args"`
		}
		if err := json.Unmarshal(msg, &req); err == nil {
			if req.Action == "export-node" {
				startNodeExport()
			} else if req.Action == "export-site" {
				if req.Name != "" {
					startSiteExport(req.Name)
				}
			} else if req.Action == "site-cmd" {
				if req.Name != "" && req.Command != "" {
					startSiteCommand(req.Name, req.Command, req.Args)
				}
			} else if req.Action == "global-cmd" {
				if req.Command != "" {
					startGlobalCommand(req.Command, req.Args)
				}
			}
		}
	}
}

func broadcastJobStatus(j *jobStatus) {
	data, err := json.Marshal(j)
	if err != nil {
		return
	}
	wsClientsMu.Lock()
	defer wsClientsMu.Unlock()
	for conn := range wsClients {
		_ = conn.WriteMessage(websocket.TextMessage, data)
	}
}

func broadcastStatsAndStorageLoop() {
	for {
		time.Sleep(5 * time.Second)
		wsClientsMu.Lock()
		if len(wsClients) == 0 {
			wsClientsMu.Unlock()
			continue
		}
		wsClientsMu.Unlock()

		stats := gatherStats()
		if stats != nil {
			data, _ := json.Marshal(map[string]any{"type": "stats_update", "payload": stats})
			wsClientsMu.Lock()
			for conn := range wsClients {
				conn.WriteMessage(websocket.TextMessage, data)
			}
			wsClientsMu.Unlock()
		}

		storage := gatherStorage()
		if storage != nil {
			data, _ := json.Marshal(map[string]any{"type": "storage_update", "payload": storage})
			wsClientsMu.Lock()
			for conn := range wsClients {
				conn.WriteMessage(websocket.TextMessage, data)
			}
			wsClientsMu.Unlock()
		}
	}
}

// ---------------------------------------------------------------------------
// Job HTTP endpoints
// ---------------------------------------------------------------------------

func apiGetJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	jobsMu.RLock()
	j, ok := jobs[id]
	jobsMu.RUnlock()

	if !ok {
		apiError(w, http.StatusNotFound, "job not found")
		return
	}
	apiJSON(w, http.StatusOK, j)
}

func apiDownloadJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	jobsMu.Lock()
	j, ok := jobs[id]
	if !ok {
		jobsMu.Unlock()
		apiError(w, http.StatusNotFound, "job not found")
		return
	}
	// Optionally remove job from map after download starts
	delete(jobs, id)
	jobsMu.Unlock()

	if j.Status != "completed" {
		apiError(w, http.StatusBadRequest, "job not completed")
		return
	}

	f, err := os.Open(j.filePath)
	if err != nil {
		os.Remove(j.filePath)
		apiError(w, http.StatusInternalServerError, "cannot open archive")
		return
	}

	archiveName := filepath.Base(j.filePath)
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", "attachment; filename="+archiveName)
	io.Copy(w, f)
	f.Close()
	os.Remove(j.filePath)
}
