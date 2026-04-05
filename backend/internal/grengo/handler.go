package grengo

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/internal/utils"
)

const sessionTTL = 10 * time.Minute

// session tracks a temporary grengo dashboard access token.
type session struct {
	ID        string    `json:"id"`
	UserID    int64     `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	LastUsed  time.Time `json:"last_used"`
	ExpiresAt time.Time `json:"expires_at"`
	// Passcode pair cached so data routes don't need headers.
	p1 string
	p2 string
}

// Handler exposes grengo management over HTTP.
type Handler struct {
	svc      *Service
	mu       sync.RWMutex
	sessions map[string]*session
}

// NewHandler creates a new grengo handler.
func NewHandler(svc *Service) *Handler {
	h := &Handler{svc: svc, sessions: make(map[string]*session)}
	go h.reapLoop()
	return h
}

// reapLoop removes expired sessions every 30 seconds.
func (h *Handler) reapLoop() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for range t.C {
		h.mu.Lock()
		now := time.Now()
		for id, s := range h.sessions {
			if now.After(s.ExpiresAt) {
				delete(h.sessions, id)
			}
		}
		h.mu.Unlock()
	}
}

// touchSession refreshes a session's inactivity timer, returning the session
// or nil if expired / not found.
func (h *Handler) touchSession(id string) *session {
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.sessions[id]
	if !ok {
		return nil
	}
	if time.Now().After(s.ExpiresAt) {
		delete(h.sessions, id)
		return nil
	}
	s.LastUsed = time.Now()
	s.ExpiresAt = s.LastUsed.Add(sessionTTL)
	return s
}

// Mount registers all grengo routes on the given router.
// jwtAuth is the JWT middleware from the main server.
func (h *Handler) Mount(r chi.Router, jwtAuth func(http.Handler) http.Handler) {
	r.Route("/grengo", func(gr chi.Router) {
		// All grengo routes require a valid JWT.
		gr.Use(jwtAuth)

		// POST /grengo/session — create a temporary session (admin + passcode).
		gr.Post("/session", h.handleCreateSession)

		// Session-gated routes: validate via {sessionId} path prefix.
		gr.Route("/s/{sessionId}", func(sr chi.Router) {
			sr.Use(h.requireSession)

			sr.Get("/validate", h.handleValidateSession)
			sr.Delete("/", h.handleDestroySession)

			sr.Get("/sites", h.handleListSites)
			sr.Post("/sites", h.handleCreateSite)
			sr.Delete("/sites/{name}", h.handleDeleteSite)

			sr.Post("/sites/{name}/start", h.handleStartSite)
			sr.Post("/sites/{name}/stop", h.handleStopSite)
			sr.Post("/sites/{name}/enable", h.handleEnableSite)
			sr.Post("/sites/{name}/disable", h.handleDisableSite)
			sr.Post("/sites/{name}/arm", h.handleArmSite)
			sr.Post("/sites/{name}/disarm", h.handleDisarmSite)

			sr.Get("/sites/{name}/export", h.handleExportSite)
			sr.Post("/import", h.handleImportSite)

			sr.Get("/sites/{name}/env", h.handleGetSiteEnv)
			sr.Put("/sites/{name}/env", h.handleUpdateSiteEnv)

			sr.Get("/stats", h.handleStats)
			sr.Get("/storage", h.handleStorage)

			sr.Post("/compose/up", h.handleComposeUp)
			sr.Post("/compose/down", h.handleComposeDown)
		})
	})
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// requireAdmin checks that the JWT claims contain the "admin" role.
func requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(auth.CtxKeyClaims).(*auth.Claims)
		if !ok {
			utils.WriteError(w, http.StatusUnauthorized, "missing claims")
			return
		}
		isAdmin := false
		for _, role := range claims.Roles {
			if role == "admin" {
				isAdmin = true
				break
			}
		}
		if !isAdmin {
			utils.WriteError(w, http.StatusForbidden, "admin role required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireSession validates the {sessionId} URL param, touches the session,
// and rejects the request if the session is invalid or expired.
func (h *Handler) requireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sid := chi.URLParam(r, "sessionId")
		if sid == "" {
			utils.WriteError(w, http.StatusUnauthorized, "session required")
			return
		}
		s := h.touchSession(sid)
		if s == nil {
			utils.WriteError(w, http.StatusUnauthorized, "session expired or invalid")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------------------
// Session handlers
// ---------------------------------------------------------------------------

// handleCreateSession verifies admin + passcode, creates a temp session, returns the UUID.
func (h *Handler) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	// Require admin role.
	claims, ok := r.Context().Value(auth.CtxKeyClaims).(*auth.Claims)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "missing claims")
		return
	}
	isAdmin := false
	for _, role := range claims.Roles {
		if role == "admin" {
			isAdmin = true
			break
		}
	}
	if !isAdmin {
		utils.WriteError(w, http.StatusForbidden, "admin role required")
		return
	}

	// Require passcode.
	if !h.svc.PasscodeConfigured() {
		utils.WriteError(w, http.StatusServiceUnavailable, "grengo passcode not configured on server")
		return
	}

	var body struct {
		P1 string `json:"p1"`
		P2 string `json:"p2"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.P1 == "" || body.P2 == "" {
		utils.WriteError(w, http.StatusBadRequest, "p1 and p2 required")
		return
	}
	if !h.svc.VerifyPasscode(body.P1, body.P2) {
		utils.WriteError(w, http.StatusForbidden, "invalid passcode")
		return
	}

	// Create session.
	now := time.Now()
	s := &session{
		ID:        uuid.New().String(),
		UserID:    claims.UserID,
		CreatedAt: now,
		LastUsed:  now,
		ExpiresAt: now.Add(sessionTTL),
		p1:        body.P1,
		p2:        body.P2,
	}
	h.mu.Lock()
	h.sessions[s.ID] = s
	h.mu.Unlock()

	utils.WriteJSON(w, http.StatusCreated, map[string]any{
		"session_id": s.ID,
		"expires_at": s.ExpiresAt,
	})
}

// handleValidateSession touches the session and returns its status.
func (h *Handler) handleValidateSession(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionId")
	s := h.touchSession(sid)
	if s == nil {
		utils.WriteError(w, http.StatusUnauthorized, "session expired or invalid")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{
		"valid":      true,
		"expires_at": s.ExpiresAt,
	})
}

// handleDestroySession explicitly ends a session.
func (h *Handler) handleDestroySession(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionId")
	h.mu.Lock()
	delete(h.sessions, sid)
	h.mu.Unlock()
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------------------------------------------------------------------------
// Data handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleListSites(w http.ResponseWriter, r *http.Request) {
	sites, err := h.svc.ListSites()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, sites)
}

func (h *Handler) handleCreateSite(w http.ResponseWriter, r *http.Request) {
	var p CreateSiteParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.svc.CreateSite(p); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "already exists") || strings.Contains(err.Error(), "is required") {
			status = http.StatusBadRequest
		}
		utils.WriteError(w, status, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusCreated, map[string]any{"ok": true})
}

func (h *Handler) handleDeleteSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svc.DeleteSite(name); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		utils.WriteError(w, status, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleStartSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svc.StartSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleStopSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svc.StopSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleEnableSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svc.EnableSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleDisableSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svc.DisableSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleArmSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svc.ArmSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": true})
}

func (h *Handler) handleDisarmSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svc.DisarmSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": false})
}

func (h *Handler) handleExportSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	archivePath, err := h.svc.ExportSite(name)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer os.Remove(archivePath)

	f, err := os.Open(archivePath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "cannot open export archive")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", "attachment; filename="+filepath.Base(archivePath))
	io.Copy(w, f)
}

func (h *Handler) handleGetSiteEnv(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	content, err := h.svc.GetSiteEnv(name)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		utils.WriteError(w, status, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"content": content})
}

func (h *Handler) handleUpdateSiteEnv(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.svc.UpdateSiteEnv(name, body.Content); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		utils.WriteError(w, status, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.Stats()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, stats)
}

func (h *Handler) handleStorage(w http.ResponseWriter, r *http.Request) {
	info, err := h.svc.Storage()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, info)
}

func (h *Handler) handleComposeUp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Build bool `json:"build"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.ComposeUp(body.Build); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleComposeDown(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.ComposeDown(); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleImportSite(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(256 << 20); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "multipart form required (max 256MB)")
		return
	}

	file, header, err := r.FormFile("archive")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "archive file required")
		return
	}
	defer file.Close()

	tmpDir := os.TempDir()
	tmpFile, err := os.CreateTemp(tmpDir, "grengo-import-*.tar.gz")
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "cannot create temp file")
		return
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if _, err := io.Copy(tmpFile, file); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to save upload")
		return
	}
	tmpFile.Close()

	newName := r.FormValue("name")
	newPort := r.FormValue("port")

	log.Printf("grengo: importing %s (name=%s port=%s)", header.Filename, newName, newPort)

	if err := h.svc.ImportSite(tmpFile.Name(), newName, newPort); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
