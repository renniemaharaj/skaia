package grengo

import (
	"encoding/json"
	log "github.com/skaia/backend/internal/syslog"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/workers"
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

		// POST /grengo/session - create a temporary session (admin + passcode).
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

			sr.Post("/sites/{name}/export", h.handleExportSite)
			sr.Post("/import", h.handleImportSite)

			sr.Get("/sites/{name}/env", h.handleGetSiteEnv)
			sr.Put("/sites/{name}/env", h.handleUpdateSiteEnv)

			sr.Get("/stats", h.handleStats)
			sr.Get("/storage", h.handleStorage)
			sr.Get("/sysinfo", h.handleSysInfo)

			sr.Post("/sites/{name}/migrate", h.handleMigrateSite)
			sr.Post("/migrate-all", h.handleMigrateAll)

			sr.Post("/export-node", h.handleExportNode)
			sr.Post("/import-node", h.handleImportNode)

			sr.Get("/jobs", h.handleListJobs)
			sr.Get("/jobs/{id}", h.handleGetJob)
			sr.Get("/jobs/{id}/download", h.handleDownloadJob)

			sr.Get("/exports", h.handleListExports)
			sr.Get("/exports/{filename}/download", h.handleDownloadExport)
			sr.Delete("/exports/{filename}", h.handleDeleteExport)

			sr.Post("/compose/up", h.handleComposeUp)
			sr.Post("/compose/down", h.handleComposeDown)
		})
	})
}

// Middleware

// requireAdmin checks that the JWT claims contain the "admin" role.
func requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(ictx.CtxKeyClaims).(*ijwt.Claims)
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
			utils.WriteError(w, http.StatusForbidden, "session required")
			return
		}
		s := h.touchSession(sid)
		if s == nil {
			utils.WriteError(w, http.StatusForbidden, "session expired or invalid")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// svcFor returns an authenticated Service for the request's session.
func (h *Handler) svcFor(r *http.Request) *Service {
	sid := chi.URLParam(r, "sessionId")
	if s := h.touchSession(sid); s != nil {
		return h.svc.WithPasscode(s.p1, s.p2)
	}
	return h.svc
}

// Session handlers

// handleCreateSession verifies admin + passcode, creates a temp session, returns the UUID.
func (h *Handler) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	// Require admin role.
	claims, ok := r.Context().Value(ictx.CtxKeyClaims).(*ijwt.Claims)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "missing claims")
		return
	}
	isPrivileged := false
	for _, role := range claims.Roles {
		if role == "admin" || role == "superuser" {
			isPrivileged = true
			break
		}
	}
	if !isPrivileged {
		utils.WriteError(w, http.StatusForbidden, "admin or superuser role required")
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
	h.svc.SetPasscode(body.P1, body.P2)

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
		utils.WriteError(w, http.StatusForbidden, "session expired or invalid")
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

// Data handlers

func (h *Handler) handleListSites(w http.ResponseWriter, r *http.Request) {
	sites, err := h.svcFor(r).ListSites()
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
	if err := h.svcFor(r).CreateSite(p); err != nil {
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
	if err := h.svcFor(r).DeleteSite(name); err != nil {
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
	if err := h.svcFor(r).StartSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleStopSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svcFor(r).StopSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleEnableSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svcFor(r).EnableSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleDisableSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svcFor(r).DisableSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleArmSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svcFor(r).ArmSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": true})
}

func (h *Handler) handleDisarmSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.svcFor(r).DisarmSite(name); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": false})
}

func (h *Handler) handleExportSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	jobID, err := h.svcFor(r).ExportSite(name)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusAccepted, map[string]any{"job_id": jobID})
}

func (h *Handler) handleGetSiteEnv(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	content, err := h.svcFor(r).GetSiteEnv(name)
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
	if err := h.svcFor(r).UpdateSiteEnv(name, body.Content); err != nil {
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
	stats, err := h.svcFor(r).Stats()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, stats)
}

func (h *Handler) handleStorage(w http.ResponseWriter, r *http.Request) {
	info, err := h.svcFor(r).Storage()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, info)
}

func (h *Handler) handleSysInfo(w http.ResponseWriter, r *http.Request) {
	info, err := h.svcFor(r).GetSysInfo()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	info.WorkerBudget = map[string]int{
		"WS":           workers.Budget(workers.DomainWS),
		"Events":       workers.Budget(workers.DomainEvents),
		"Compile":      workers.Budget(workers.DomainDSCompile),
		"Execute":      workers.Budget(workers.DomainDSExecute),
		"Scraper":      workers.Budget(workers.DomainMediaScraper),
		"Provisioning": workers.Budget(workers.DomainProvisioning),
	}

	utils.WriteJSON(w, http.StatusOK, info)
}

func (h *Handler) handleMigrateSite(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var body struct {
		Rebuild bool `json:"rebuild"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	result, err := h.svcFor(r).MigrateSite(name, body.Rebuild)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) handleMigrateAll(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Rebuild bool `json:"rebuild"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	result, err := h.svcFor(r).MigrateAll(body.Rebuild)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) handleExportNode(w http.ResponseWriter, r *http.Request) {
	jobID, err := h.svcFor(r).ExportNode()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusAccepted, map[string]any{"job_id": jobID})
}

type ImportNodeReq struct {
	ArchiveURL string `json:"archive_url"`
}

func (h *Handler) handleImportNode(w http.ResponseWriter, r *http.Request) {
	var req ImportNodeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if req.ArchiveURL == "" {
		utils.WriteError(w, http.StatusBadRequest, "archive_url required")
		return
	}

	physicalPath := strings.TrimPrefix(req.ArchiveURL, "/")
	if !strings.HasPrefix(physicalPath, "uploads/") {
		utils.WriteError(w, http.StatusBadRequest, "invalid archive_url")
		return
	}

	log.Printf("grengo: importing node archive %s", physicalPath)

	jobID, err := h.svcFor(r).ImportNode(physicalPath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Clean up user upload now that it has been streamed to grengo
	os.Remove(physicalPath)

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "job_id": jobID})
}

func (h *Handler) handleComposeUp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Build bool `json:"build"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := h.svcFor(r).ComposeUp(body.Build); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) handleComposeDown(w http.ResponseWriter, r *http.Request) {
	if err := h.svcFor(r).ComposeDown(); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type ImportSiteReq struct {
	ArchiveURL string `json:"archive_url"`
	Name       string `json:"name"`
	Port       string `json:"port"`
}

func (h *Handler) handleImportSite(w http.ResponseWriter, r *http.Request) {
	var req ImportSiteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if req.ArchiveURL == "" {
		utils.WriteError(w, http.StatusBadRequest, "archive_url required")
		return
	}

	physicalPath := strings.TrimPrefix(req.ArchiveURL, "/")
	if !strings.HasPrefix(physicalPath, "uploads/") {
		utils.WriteError(w, http.StatusBadRequest, "invalid archive_url")
		return
	}

	log.Printf("grengo: importing %s (name=%s port=%s)", physicalPath, req.Name, req.Port)

	jobID, err := h.svcFor(r).ImportSite(physicalPath, req.Name, req.Port)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Clean up user upload now that it has been streamed to grengo
	os.Remove(physicalPath)

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "job_id": jobID})
}

func (h *Handler) handleGetJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	j, err := h.svcFor(r).GetJob(id)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		utils.WriteError(w, status, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, j)
}

func (h *Handler) handleListJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.svcFor(r).ListJobs()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, jobs)
}

func (h *Handler) handleDownloadJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	archivePath, err := h.svcFor(r).DownloadJob(id)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		} else if strings.Contains(err.Error(), "not completed") {
			status = http.StatusBadRequest
		}
		utils.WriteError(w, status, err.Error())
		return
	}
	defer os.Remove(archivePath)

	f, err := os.Open(archivePath)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "cannot open job archive")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", "attachment; filename="+filepath.Base(archivePath))
	io.Copy(w, f)
}

func (h *Handler) handleListExports(w http.ResponseWriter, r *http.Request) {
	files, err := h.svcFor(r).ListExports()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusOK, files)
}

func (h *Handler) handleDownloadExport(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if err := h.svcFor(r).DownloadExport(w, filename); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		utils.WriteError(w, status, err.Error())
	}
}

func (h *Handler) handleDeleteExport(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	jobID, err := h.svcFor(r).DeleteExport(filename)
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		utils.WriteError(w, status, err.Error())
		return
	}
	utils.WriteJSON(w, http.StatusAccepted, map[string]any{"ok": true, "job_id": jobID})
}
