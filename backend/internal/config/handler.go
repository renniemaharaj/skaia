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
	iupload "github.com/skaia/backend/internal/upload"
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

// Handler serves site-configuration and landing-page endpoints.
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
		// Public – anyone can read branding, SEO, landing layout, and feature toggles
		r.Get("/branding", h.getBranding)
		r.Get("/seo", h.getSEO)
		r.Get("/footer", h.getFooter)
		r.Get("/landing", h.getLanding)
		r.Get("/features", h.getFeatures)
		r.Get("/feature/{feature}", h.getFeature)

		// Protected – requires home.manage
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Put("/branding", h.updateBranding)
			r.Put("/seo", h.updateSEO)
			r.Put("/footer", h.updateFooter)

			// Sections
			r.Post("/landing/sections", h.createSection)
			r.Put("/landing/sections/{id}", h.updateSection)
			r.Delete("/landing/sections/{id}", h.deleteSection)
			r.Put("/landing/sections/reorder", h.reorderSections)

			// Items
			r.Post("/landing/sections/{sectionId}/items", h.createItem)
			r.Put("/landing/items/{id}", h.updateItem)
			r.Delete("/landing/items/{id}", h.deleteItem)
			r.Put("/landing/sections/{sectionId}/items/reorder", h.reorderItems)
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

// ── landing page ────────────────────────────────────────────────────────────

func (h *Handler) getLanding(w http.ResponseWriter, r *http.Request) {
	sections, err := h.svc.ListSections()
	if err != nil {
		log.Printf("config.getLanding: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to load landing")
		return
	}
	utils.WriteJSON(w, http.StatusOK, sections)
}

func (h *Handler) createSection(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var s models.LandingSection
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.svc.CreateSection(&s); err != nil {
		log.Printf("config.createSection: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "create failed")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, s)
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActSectionCreated,
		Resource:   ievents.ResConfig,
		ResourceID: s.ID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"section_type": s.SectionType},
		Fn: func() {
			h.hub.BroadcastConfig("landing_section_created", s)
		},
	})
}

func (h *Handler) updateSection(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var s models.LandingSection
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	s.ID = id
	if err := h.svc.UpdateSection(&s); err != nil {
		log.Printf("config.updateSection: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "update failed")
		return
	}
	updated, _ := h.svc.GetSection(id)
	userID, _ := utils.UserIDFromCtx(r)
	if updated != nil {
		utils.WriteJSON(w, http.StatusOK, updated)
		h.dispatcher.Dispatch(ievents.Job{
			UserID:     userID,
			Activity:   ievents.ActSectionUpdated,
			Resource:   ievents.ResConfig,
			ResourceID: id,
			IP:         ievents.ClientIP(r),
			Fn: func() {
				h.hub.BroadcastConfig("landing_section_updated", updated)
			},
		})
	} else {
		utils.WriteJSON(w, http.StatusOK, s)
		h.dispatcher.Dispatch(ievents.Job{
			UserID:     userID,
			Activity:   ievents.ActSectionUpdated,
			Resource:   ievents.ResConfig,
			ResourceID: id,
			IP:         ievents.ClientIP(r),
			Fn: func() {
				h.hub.BroadcastConfig("landing_section_updated", s)
			},
		})
	}
}

func (h *Handler) deleteSection(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Fetch section items before deleting so we can clean up their image files.
	section, _ := h.svc.GetSection(id)

	if err := h.svc.DeleteSection(id); err != nil {
		log.Printf("config.deleteSection: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActSectionDeleted,
		Resource:   ievents.ResConfig,
		ResourceID: id,
		IP:         ievents.ClientIP(r),
		Fn: func() {
			if section != nil {
				for _, item := range section.Items {
					if item.ImageURL != "" {
						iupload.DeleteUploadFile(item.ImageURL)
					}
				}
			}
			h.hub.BroadcastConfig("landing_section_deleted", map[string]interface{}{"id": id})
		},
	})
}

func (h *Handler) reorderSections(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.svc.ReorderSections(body.IDs); err != nil {
		log.Printf("config.reorderSections: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "reorder failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActSectionUpdated,
		Resource: ievents.ResConfig,
		IP:       ievents.ClientIP(r),
		Meta:     map[string]interface{}{"action": "reorder"},
		Fn: func() {
			h.hub.BroadcastConfig("landing_reordered", map[string]interface{}{"ids": body.IDs})
		},
	})
}

// ── items ───────────────────────────────────────────────────────────────────

func (h *Handler) createItem(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	secID, err := parseID(r, "sectionId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid sectionId")
		return
	}
	var item models.LandingItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	item.SectionID = secID
	if err := h.svc.CreateItem(&item); err != nil {
		log.Printf("config.createItem: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "create failed")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, item)
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActSectionUpdated,
		Resource:   ievents.ResConfig,
		ResourceID: secID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"action": "item_created", "item_id": item.ID},
		Fn: func() {
			h.hub.BroadcastConfig("landing_item_created", item)
		},
	})
}

func (h *Handler) updateItem(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var item models.LandingItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	item.ID = id
	if err := h.svc.UpdateItem(&item); err != nil {
		log.Printf("config.updateItem: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "update failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, item)
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActSectionUpdated,
		Resource:   ievents.ResConfig,
		ResourceID: item.SectionID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"action": "item_updated", "item_id": id},
		Fn: func() {
			h.hub.BroadcastConfig("landing_item_updated", item)
		},
	})
}

func (h *Handler) deleteItem(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Fetch the item first so we can clean up its image file.
	item, _ := h.svc.GetItem(id)

	if err := h.svc.DeleteItem(id); err != nil {
		log.Printf("config.deleteItem: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:   userID,
		Activity: ievents.ActSectionUpdated,
		Resource: ievents.ResConfig,
		IP:       ievents.ClientIP(r),
		Meta:     map[string]interface{}{"action": "item_deleted", "item_id": id},
		Fn: func() {
			if item != nil && item.ImageURL != "" {
				iupload.DeleteUploadFile(item.ImageURL)
			}
			h.hub.BroadcastConfig("landing_item_deleted", map[string]interface{}{"id": id})
		},
	})
}

func (h *Handler) reorderItems(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	secID, err := parseID(r, "sectionId")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid sectionId")
		return
	}
	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.svc.ReorderItems(secID, body.IDs); err != nil {
		log.Printf("config.reorderItems: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "reorder failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	userID, _ := utils.UserIDFromCtx(r)
	h.dispatcher.Dispatch(ievents.Job{
		UserID:     userID,
		Activity:   ievents.ActSectionUpdated,
		Resource:   ievents.ResConfig,
		ResourceID: secID,
		IP:         ievents.ClientIP(r),
		Meta:       map[string]interface{}{"action": "items_reordered"},
		Fn: func() {
			h.hub.BroadcastConfig("landing_items_reordered", map[string]interface{}{"section_id": secID, "ids": body.IDs})
		},
	})
}
