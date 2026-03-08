package config

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// Handler serves site-configuration and landing-page endpoints.
type Handler struct {
	svc     *Service
	userSvc *iuser.Service
}

// NewHandler creates a Handler.
func NewHandler(svc *Service, userSvc *iuser.Service) *Handler {
	return &Handler{svc: svc, userSvc: userSvc}
}

// Mount registers routes.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/config", func(r chi.Router) {
		// Public – anyone can read branding, SEO, and landing layout
		r.Get("/branding", h.getBranding)
		r.Get("/seo", h.getSEO)
		r.Get("/footer", h.getFooter)
		r.Get("/landing", h.getLanding)

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
			SiteName: "Skaia", Tagline: "", LogoURL: "/logo.png", FaviconURL: "/favicon.ico",
			HeaderTitle: "CUEBALLCRAFT", HeaderSubtitle: "Skaiacraft", HeaderVariant: 1, MenuVariant: 1,
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
}

func (h *Handler) getFooter(w http.ResponseWriter, r *http.Request) {
	sc, err := h.svc.GetConfig("footer")
	if err != nil {
		log.Printf("config.getFooter: %v", err)
		utils.WriteJSON(w, http.StatusOK, models.Footer{
			Variant:          1,
			SiteTitle:        "Cueballcraft Skaiacraft",
			SiteDescription:  "A premium vanilla Minecraft server with a community spanning over 12 years",
			CommunityHeading: "Community",
			CommunityItems:   []string{"Family Friendly Environment", "Support for All Clients", "Active Moderation", "Welcoming to New Players"},
			CopyrightText:    "Cueballcraft Skaiacraft. All rights reserved.",
			QuickLinks:       []models.Link{{Label: "Home", URL: "/"}, {Label: "Store", URL: "/store"}, {Label: "Forum", URL: "/forum"}},
			ContactHeading:   "Get In Touch",
			ContactText:      "Join our community and be part of the adventure.",
			Tagline:          "Crafted with care",
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
	if updated != nil {
		utils.WriteJSON(w, http.StatusOK, updated)
	} else {
		utils.WriteJSON(w, http.StatusOK, s)
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
	if err := h.svc.DeleteSection(id); err != nil {
		log.Printf("config.deleteSection: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
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
	if err := h.svc.DeleteItem(id); err != nil {
		log.Printf("config.deleteItem: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
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
}
