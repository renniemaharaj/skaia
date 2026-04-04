package grengo

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/internal/utils"
)

// Handler exposes grengo management over HTTP.
type Handler struct {
	svc *Service
}

// NewHandler creates a new grengo handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Mount registers all grengo routes on the given router.
// jwtAuth is the JWT middleware from the main server.
func (h *Handler) Mount(r chi.Router, jwtAuth func(http.Handler) http.Handler) {
	r.Route("/grengo", func(gr chi.Router) {
		// All grengo routes require a valid JWT
		gr.Use(jwtAuth)

		// POST /grengo/auth  –  verify passcode (no passcode header needed)
		gr.Post("/auth", h.handleAuth)

		// Everything below also requires admin role + passcode headers
		gr.Group(func(pr chi.Router) {
			pr.Use(requireAdmin)
			pr.Use(h.requirePasscode)

			pr.Get("/sites", h.handleListSites)
			pr.Post("/sites", h.handleCreateSite)
			pr.Delete("/sites/{name}", h.handleDeleteSite)

			pr.Post("/sites/{name}/start", h.handleStartSite)
			pr.Post("/sites/{name}/stop", h.handleStopSite)
			pr.Post("/sites/{name}/enable", h.handleEnableSite)
			pr.Post("/sites/{name}/disable", h.handleDisableSite)

			pr.Get("/sites/{name}/export", h.handleExportSite)
			pr.Post("/import", h.handleImportSite)

			pr.Post("/compose/up", h.handleComposeUp)
			pr.Post("/compose/down", h.handleComposeDown)
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

// requirePasscode verifies the X-Grengo-P1 / X-Grengo-P2 headers.
func (h *Handler) requirePasscode(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !h.svc.PasscodeConfigured() {
			utils.WriteError(w, http.StatusServiceUnavailable, "grengo passcode not configured on server")
			return
		}
		p1 := r.Header.Get("X-Grengo-P1")
		p2 := r.Header.Get("X-Grengo-P2")
		if p1 == "" || p2 == "" {
			utils.WriteError(w, http.StatusUnauthorized, "passcode headers required")
			return
		}
		if !h.svc.VerifyPasscode(p1, p2) {
			utils.WriteError(w, http.StatusForbidden, "invalid passcode")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// handleAuth verifies the passcode pair and returns a status.
func (h *Handler) handleAuth(w http.ResponseWriter, r *http.Request) {
	// Require admin role for auth too
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

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

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
