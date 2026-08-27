package config

import (
	"encoding/json"
	"errors"
	log "github.com/skaia/backend/internal/syslog"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/s_registry"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
	"github.com/skaia/features"
)

// feature spec: list keys of modules that can be toggled via env
var defaultFeatureSet = features.DefaultNames()
var optionalFeatureSet = features.OptionalNames()

func getFeaturesStatus() map[string]bool {
	raw := os.Getenv("FEATURES_ENABLED")
	features := map[string]bool{}

	if strings.TrimSpace(raw) == "" {
		// no explicit list => all default features enabled for backwards compatibility
		for _, f := range defaultFeatureSet {
			features[f] = true
		}
		for _, f := range optionalFeatureSet {
			features[f] = false
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
	for _, f := range optionalFeatureSet {
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
	for _, f := range optionalFeatureSet {
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
		r.Get("/legal/manifest", h.getLegalManifest)
		r.Get("/comment-slowmode", h.getCommentSlowMode)
		r.Get("/features", h.getFeatures)
		r.Get("/feature/{feature}", h.getFeature)
		r.Get("/sections", h.listSectionTypes)
		r.Get("/section-types/{type}", h.getSectionType)
		r.Get("/components", h.listComponents)
		r.Get("/components/{type}", h.getComponent)

		// Protected – legal checkout selection also permits store.manageOrders.
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Put("/branding", h.updateBranding)
			r.Get("/legal", h.getLegal)
			r.Put("/legal", h.updateLegal)
			r.Put("/legal/checkout", h.updateCheckoutPolicies)
			r.Put("/seo", h.updateSEO)
			r.Put("/footer", h.updateFooter)
			r.Put("/comment-slowmode", h.updateCommentSlowMode)
		})
	})
}

// helpers
func (h *Handler) requireHomeManage(r *http.Request) bool {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		return false
	}
	has, _ := h.userSvc.HasPermission(uid, "home.manage")
	return has
}

func (h *Handler) canManageCheckoutPolicies(r *http.Request) bool {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		return false
	}
	home, _ := h.userSvc.HasPermission(uid, "home.manage")
	store, _ := h.userSvc.HasPermission(uid, "store.manageOrders")
	return home || store
}

// config endpoints
func (h *Handler) listSectionTypes(w http.ResponseWriter, r *http.Request) {
	utils.WriteJSON(w, http.StatusOK, s_registry.List())
}

func (h *Handler) getSectionType(w http.ResponseWriter, r *http.Request) {
	typ := chi.URLParam(r, "type")
	def, ok := s_registry.Get(typ)
	if !ok {
		utils.WriteError(w, http.StatusNotFound, "section type not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, def)
}

func (h *Handler) listComponents(w http.ResponseWriter, r *http.Request) {
	utils.WriteJSON(w, http.StatusOK, s_registry.ListComponents())
}

func (h *Handler) getComponent(w http.ResponseWriter, r *http.Request) {
	typ := chi.URLParam(r, "type")
	c, ok := s_registry.GetComponent(typ)
	if !ok {
		utils.WriteError(w, http.StatusNotFound, "component type not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, c)
}

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
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	userID, _ := utils.UserIDFromCtx(r)
	payload, err := h.svc.SaveSEO(userID, string(body))
	if errors.Is(err, ErrConfigMutationForbidden) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	if errors.Is(err, ErrInvalidSEOConfig) {
		utils.WriteError(w, http.StatusBadRequest, "invalid site settings")
		return
	}
	if err != nil {
		log.Printf("config.updateSEO: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(payload)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActSEOUpdated,
		Resource: ievents.ResConfig,
		IP:       ievents.ClientIP(r),
		Fn: func() {
			h.hub.BroadcastConfig("seo_updated", payload)
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

func (h *Handler) getLegalManifest(w http.ResponseWriter, _ *http.Request) {
	config, err := h.svc.LegalConfig()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "policy configuration unavailable")
		return
	}
	utils.WriteJSON(w, http.StatusOK, config)
}

func (h *Handler) getLegal(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	config, err := h.svc.LegalConfig()
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "policy configuration unavailable")
		return
	}
	utils.WriteJSON(w, http.StatusOK, config)
}

func (h *Handler) updateLegal(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body models.LegalConfig
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid policy configuration")
		return
	}
	if err := h.svc.SaveLegalConfig(&body); err != nil {
		if errors.Is(err, ErrInvalidLegalConfig) {
			utils.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, body)
}

func (h *Handler) updateCheckoutPolicies(w http.ResponseWriter, r *http.Request) {
	if !h.canManageCheckoutPolicies(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body struct {
		PolicyIDs    []string `json:"policy_ids"`
		Variant      string   `json:"notice_variant"`
		Message      string   `json:"notice_message"`
		CheckboxText string   `json:"checkbox_text"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	if err := decoder.Decode(&body); err != nil {
		log.Printf("config.updateCheckoutPolicies: decode: %v", err)
		utils.WriteError(w, http.StatusBadRequest, "invalid checkout policy configuration")
		return
	}
	config, err := h.svc.SaveCheckoutConfig(body.PolicyIDs, body.Variant, body.Message, body.CheckboxText)
	if err != nil {
		if errors.Is(err, ErrInvalidLegalConfig) {
			utils.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "save failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, config)
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
