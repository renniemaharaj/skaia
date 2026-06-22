package app

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/skaia/grengo/internal/hardware"
)

// WebSocket & Background Jobs

type jobStatus struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`             // "export-node", "export-site"
	Target    string    `json:"target,omitempty"` // site name or node
	Status    string    `json:"status"`           // "running", "completed", "failed"
	Message   string    `json:"message,omitempty"`
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

	grpcJobListenersMu sync.Mutex
	grpcJobListeners   = make(map[chan *jobStatus]bool)
)

type grengoActionRequest struct {
	Action  string   `json:"action"`
	Name    string   `json:"name"`
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

func dispatchGrengoAction(req grengoActionRequest) (string, error) {
	switch req.Action {
	case "export-node":
		return startNodeExport(), nil
	case "export-site":
		if req.Name == "" {
			return "", fmt.Errorf("name required")
		}
		return startSiteExport(req.Name), nil
	case "site-cmd":
		if req.Name == "" || req.Command == "" {
			return "", fmt.Errorf("name and command required")
		}
		return startSiteCommand(req.Name, req.Command, req.Args), nil
	case "global-cmd":
		if req.Command == "" {
			return "", fmt.Errorf("command required")
		}
		return startGlobalCommand(req.Command, req.Args), nil
	case "exec":
		if req.Command == "" {
			return "", fmt.Errorf("command required")
		}
		return startGenericCommand(req.Command, req.Args), nil
	default:
		return "", fmt.Errorf("unknown action %q", req.Action)
	}
}

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
		var req grengoActionRequest
		if err := json.Unmarshal(msg, &req); err == nil {
			_, _ = dispatchGrengoAction(req)
		}
	}
}

func broadcastJobStatus(j *jobStatus) {
	data, err := json.Marshal(j)
	if err != nil {
		return
	}
	wsClientsMu.Lock()
	for conn := range wsClients {
		_ = conn.WriteMessage(websocket.TextMessage, data)
	}
	wsClientsMu.Unlock()

	grpcJobListenersMu.Lock()
	for ch := range grpcJobListeners {
		select {
		case ch <- j:
		default:
		}
	}
	grpcJobListenersMu.Unlock()
}

func broadcastStatsAndStorageLoop() {
	ticks := 0
	for {
		time.Sleep(5 * time.Second)
		ticks++

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

		if ticks%12 == 1 { // Poll storage every 60s
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

		hwPayload := hardware.GetPayload()
		data, _ := json.Marshal(map[string]any{"type": "hardware_update", "payload": hwPayload})
		wsClientsMu.Lock()
		for conn := range wsClients {
			conn.WriteMessage(websocket.TextMessage, data)
		}
		wsClientsMu.Unlock()
	}
}

// Job HTTP endpoints

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

func apiListJobs(w http.ResponseWriter, r *http.Request) {
	jobsMu.RLock()
	list := make([]*jobStatus, 0, len(jobs))
	for _, j := range jobs {
		list = append(list, j)
	}
	jobsMu.RUnlock()
	apiJSON(w, http.StatusOK, list)
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

	info, err := f.Stat()
	if err == nil {
		w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	}

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", "attachment; filename="+archiveName)
	io.Copy(w, f)
	f.Close()
	os.Remove(j.filePath)
}
