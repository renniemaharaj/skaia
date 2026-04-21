package config

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	ievents "github.com/skaia/backend/internal/events"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// feature spec: list keys of modules that can be toggled via env
var defaultFeatureSet = []string{"landing", "store", "forum", "cart", "users", "inbox", "presence"}

func getFeaturesStatus() map[string]bool {
	raw := os.Getenv("FEATURES_ENABLED")
	features := map[string]bool{}

	if strings.TrimSpace(raw) == "" {
		// no explicit list => all default features enabled for backwards compatibility
		for _, f := range defaultFeatureSet {
			features[f] = true
		}
		return features
	}

	for _, part := range strings.Split(raw, ",") {
		name := strings.TrimSpace(strings.ToLower(part))
		if name != "" {
			features[name] = true
		}
	}

	// Ensure unspecified default features are explicitly disabled
	for _, f := range defaultFeatureSet {
		if _, ok := features[f]; !ok {
			features[f] = false
		}
	}

	return features
}

func getEnabledFeatures() []string {
	status := getFeaturesStatus()
	enabled := []string{}
	for _, f := range defaultFeatureSet {
		if status[f] {
			enabled = append(enabled, f)
		}
	}
	return enabled
}

func (h *Handler) getFeatures(w http.ResponseWriter, r *http.Request) {
	// Return a predictable array of enabled features (possibly empty), with stable ordering
	utils.WriteJSON(w, http.StatusOK, getEnabledFeatures())
}

func (h *Handler) getFeature(w http.ResponseWriter, r *http.Request) {
	feature := chi.URLParam(r, "feature")
	if feature == "" {
		utils.WriteError(w, http.StatusBadRequest, "missing feature")
		return
	}

	enabled := getFeaturesStatus()[feature]
	if !enabled {
		utils.WriteError(w, http.StatusNotFound, "feature not enabled")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]bool{"allowed": true})
}

// Handler serves site-configuration and page endpoints.
type Handler struct {
	svc        *Service
	userSvc    *iuser.Service
	hub        *ws.Hub
	dispatcher *ievents.Dispatcher
}

// NewHandler creates a Handler.
func NewHandler(svc *Service, userSvc *iuser.Service, hub *ws.Hub, dispatcher *ievents.Dispatcher) *Handler {
	return &Handler{svc: svc, userSvc: userSvc, hub: hub, dispatcher: dispatcher}
}

// Mount registers routes.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/config", func(r chi.Router) {
		// Public – anyone can read branding, SEO, footer, and feature toggles
		r.Get("/branding", h.getBranding)
		r.Get("/seo", h.getSEO)
		r.Get("/footer", h.getFooter)
		r.Get("/comment-slowmode", h.getCommentSlowMode)
		r.Get("/features", h.getFeatures)
		r.Get("/feature/{feature}", h.getFeature)

		// Protected – requires home.manage
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Put("/branding", h.updateBranding)
			r.Put("/seo", h.updateSEO)
			r.Put("/footer", h.updateFooter)
			r.Put("/comment-slowmode", h.updateCommentSlowMode)
		})
	})
}

// ── helpers ─────────────────────────────────────────────────────────────────

func (h *Handler) requireHomeManage(r *http.Request) bool {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		return false
	}
	has, _ := h.userSvc.HasPermission(uid, "home.manage")
	return has
}

func parseID(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

// ── config endpoints ────────────────────────────────────────────────────────

func (h *Handler) getBranding(w http.ResponseWriter, r *http.Request) {
	sc, err := h.svc.GetConfig("branding")
	if err != nil {
		log.Printf("config.getBranding: %v", err)
		utils.WriteJSON(w, http.StatusOK, models.Branding{
			HeaderVariant: 1, MenuVariant: 1,
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(sc.Value))
}

func (h *Handler) getSEO(w http.ResponseWriter, r *http.Request) {
	sc, err := h.svc.GetConfig("seo")
	if err != nil {
		log.Printf("config.getSEO: %v", err)
		utils.WriteJSON(w, http.StatusOK, models.SEO{})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(sc.Value))
}

func (h *Handler) updateBranding(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.svc.UpsertConfig("branding", string(body)); err != nil {
		log.Printf("config.updateBranding: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActBrandingUpdated,
		Resource: ievents.ResConfig,
		IP:       ievents.ClientIP(r),
		Fn: func() {
			h.hub.BroadcastConfig("branding_updated", body)
		},
	})
}

func (h *Handler) updateSEO(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.svc.UpsertConfig("seo", string(body)); err != nil {
		log.Printf("config.updateSEO: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActSEOUpdated,
		Resource: ievents.ResConfig,
		IP:       ievents.ClientIP(r),
		Fn: func() {
			h.hub.BroadcastConfig("seo_updated", body)
		},
	})
}

func (h *Handler) getFooter(w http.ResponseWriter, r *http.Request) {
	sc, err := h.svc.GetConfig("footer")
	if err != nil {
		log.Printf("config.getFooter: %v", err)
		utils.WriteJSON(w, http.StatusOK, models.Footer{
			Variant:    1,
			QuickLinks: []models.Link{{Label: "Home", URL: "/"}, {Label: "Store", URL: "/store"}, {Label: "Forum", URL: "/forum"}},
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(sc.Value))
}

func (h *Handler) updateFooter(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.svc.UpsertConfig("footer", string(body)); err != nil {
		log.Printf("config.updateFooter: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActFooterUpdated,
		Resource: ievents.ResConfig,
		IP:       ievents.ClientIP(r),
		Fn: func() {
			h.hub.BroadcastConfig("footer_updated", body)
		},
	})
}

func (h *Handler) getCommentSlowMode(w http.ResponseWriter, r *http.Request) {
	sc, err := h.svc.GetConfig("comment_slowmode")
	if err != nil || sc == nil {
		utils.WriteJSON(w, http.StatusOK, map[string]any{"enabled": false, "interval": 10})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(sc.Value))
}

func (h *Handler) updateCommentSlowMode(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body struct {
		Enabled  bool `json:"enabled"`
		Interval int  `json:"interval"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Interval < 1 {
		body.Interval = 10
	}
	payload, err := json.Marshal(body)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	if err := h.svc.UpsertConfig("comment_slowmode", string(payload)); err != nil {
		log.Printf("config.updateCommentSlowMode: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	// Apply immediately to all existing WebSocket connections.
	h.hub.SetChatSlowMode(body.Enabled, body.Interval)
	w.Header().Set("Content-Type", "application/json")
	w.Write(payload)
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActConfigUpdated,
		Resource: ievents.ResConfig,
		IP:       ievents.ClientIP(r),
		Fn: func() {
			h.hub.BroadcastConfig("comment_slowmode_updated", payload)
		},
	})
}
