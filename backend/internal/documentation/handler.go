package docs

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"
	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

type Handler struct {
	svc        *Service
	hub        *ws.Hub
	dispatcher *ievents.Dispatcher
}

func NewHandler(svc *Service, hub *ws.Hub, dispatcher *ievents.Dispatcher) *Handler {
	return &Handler{svc: svc, hub: hub, dispatcher: dispatcher}
}

func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler) {
	r.Route("/docs", func(r chi.Router) {
		r.Get("/", h.list)
		r.With(jwt).Get("/mine", h.listMine)
		r.With(jwt).Post("/", h.create)
		r.With(jwt).Put("/id/{id}", h.update)
		r.With(jwt).Delete("/id/{id}", h.delete)
		r.With(jwt).Put("/id/{id}/navigation", h.reorder)
		r.With(jwt).Post("/id/{id}/sections", h.createSection)
		r.With(jwt).Post("/id/{id}/articles", h.createArticle)
		r.With(jwt).Put("/sections/{id}", h.updateSection)
		r.With(jwt).Delete("/sections/{id}", h.deleteSection)
		r.With(jwt).Put("/articles/{id}", h.updateArticle)
		r.With(jwt).Delete("/articles/{id}", h.deleteArticle)
		r.Get("/{slug}/search", h.search)
		r.Get("/{slug}/articles/{articleSlug}", h.article)
		r.Get("/{slug}", h.manifest)
	})
}

func actorID(r *http.Request) int64         { id, _ := utils.UserIDFromCtx(r); return id }
func pathID(r *http.Request) (int64, error) { return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64) }
func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 600000))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func writeDomainError(w http.ResponseWriter, err error) {
	var pqErr *pq.Error
	switch {
	case errors.Is(err, ErrForbidden):
		utils.WriteError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, ErrNotFound):
		utils.WriteError(w, http.StatusNotFound, "not found")
	case errors.Is(err, ErrInvalid):
		utils.WriteError(w, http.StatusBadRequest, "invalid documentation input")
	case errors.Is(err, ErrConflict):
		utils.WriteError(w, http.StatusConflict, "documentation changed; reload and try again")
	case errors.As(err, &pqErr) && (pqErr.Code == "23505" || pqErr.Code == "23503" || pqErr.Code == "23514"):
		utils.WriteError(w, http.StatusConflict, "documentation conflict")
	default:
		utils.WriteError(w, http.StatusInternalServerError, "documentation operation failed")
	}
}

func (h *Handler) emit(actor int64, action string, id int64, data any) {
	if h.hub != nil {
		// The global message carries no resource identity so private documentation
		// cannot be enumerated. Authorized resource subscribers receive the scoped
		// identity through the fail-closed subscription policy.
		h.hub.BroadcastDocumentation("catalog_invalidated", nil)
		if id > 0 {
			h.hub.PropagateDocumentation(id, data, action)
		}
	}
	if h.dispatcher != nil {
		h.dispatcher.Dispatch(ievents.Job{UserID: actor, Activity: "documentation." + action, Resource: "documentation", ResourceID: id})
	}
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListPublic(actorID(r))
	if err != nil {
		writeDomainError(w, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, items)
}
func (h *Handler) listMine(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.ListOwned(actorID(r))
	if err != nil {
		writeDomainError(w, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, items)
}
func (h *Handler) manifest(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.Manifest(chi.URLParam(r, "slug"), actorID(r))
	if err != nil {
		writeDomainError(w, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, item)
}
func (h *Handler) article(w http.ResponseWriter, r *http.Request) {
	item, err := h.svc.Article(chi.URLParam(r, "slug"), chi.URLParam(r, "articleSlug"), actorID(r))
	if err != nil {
		writeDomainError(w, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, item)
}
func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Search(chi.URLParam(r, "slug"), r.URL.Query().Get("q"), actorID(r))
	if err != nil {
		writeDomainError(w, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, items)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var doc models.Documentation
	if !decode(w, r, &doc) {
		return
	}
	actor := actorID(r)
	if err := h.svc.Create(&doc, actor); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "created", doc.ID, map[string]any{"id": doc.ID, "slug": doc.Slug})
	utils.WriteJSON(w, http.StatusCreated, doc)
}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	var req struct {
		Slug        string `json:"slug"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Visibility  string `json:"visibility"`
		Revision    int64  `json:"revision"`
	}
	if !decode(w, r, &req) {
		return
	}
	doc := models.Documentation{ID: id, Slug: req.Slug, Title: req.Title, Description: req.Description, Visibility: req.Visibility}
	actor := actorID(r)
	if err = h.svc.Update(&doc, actor, req.Revision); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "updated", id, map[string]any{"id": id, "slug": doc.Slug})
	utils.WriteJSON(w, 200, doc)
}
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	actor := actorID(r)
	if err = h.svc.Delete(id, actor); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "deleted", id, map[string]any{"id": id})
	utils.WriteJSON(w, 200, map[string]string{"status": "deleted"})
}
func (h *Handler) reorder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	var order NavigationOrder
	if !decode(w, r, &order) {
		return
	}
	actor := actorID(r)
	if err = h.svc.Reorder(id, actor, order); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "reordered", id, map[string]any{"id": id})
	utils.WriteJSON(w, 200, map[string]string{"status": "updated"})
}

func (h *Handler) createSection(w http.ResponseWriter, r *http.Request) {
	docID, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	var req struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &req) {
		return
	}
	item := models.DocumentationSection{DocumentationID: docID, Title: req.Title}
	actor := actorID(r)
	if err = h.svc.CreateSection(&item, actor); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "section_created", docID, map[string]any{"documentation_id": docID, "section_id": item.ID})
	utils.WriteJSON(w, 201, item)
}
func (h *Handler) updateSection(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	var req struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &req) {
		return
	}
	item := models.DocumentationSection{ID: id, Title: req.Title}
	actor := actorID(r)
	if err = h.svc.UpdateSection(&item, actor); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "section_updated", item.DocumentationID, map[string]any{"documentation_id": item.DocumentationID, "section_id": id})
	utils.WriteJSON(w, 200, item)
}
func (h *Handler) deleteSection(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	actor := actorID(r)
	if err = h.svc.DeleteSection(id, actor); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "section_deleted", 0, map[string]any{"section_id": id})
	utils.WriteJSON(w, 200, map[string]string{"status": "deleted"})
}

type articleRequest struct {
	SectionID *int64 `json:"section_id"`
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	Content   string `json:"content"`
	Revision  int64  `json:"revision"`
}

func (h *Handler) createArticle(w http.ResponseWriter, r *http.Request) {
	docID, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	var req articleRequest
	if !decode(w, r, &req) {
		return
	}
	item := models.DocumentationArticle{DocumentationID: docID, SectionID: req.SectionID, Slug: req.Slug, Title: req.Title, Summary: req.Summary, Content: req.Content}
	actor := actorID(r)
	if err = h.svc.CreateArticle(&item, actor); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "article_created", docID, map[string]any{"documentation_id": docID, "article_id": item.ID, "slug": item.Slug})
	utils.WriteJSON(w, 201, item)
}
func (h *Handler) updateArticle(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	var req articleRequest
	if !decode(w, r, &req) {
		return
	}
	item := models.DocumentationArticle{ID: id, SectionID: req.SectionID, Slug: req.Slug, Title: req.Title, Summary: req.Summary, Content: req.Content}
	actor := actorID(r)
	if err = h.svc.UpdateArticle(&item, actor, req.Revision); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "article_updated", item.DocumentationID, map[string]any{"documentation_id": item.DocumentationID, "article_id": id, "slug": item.Slug})
	if h.hub != nil {
		h.hub.PropagateDocumentationArticle(id, map[string]any{"article_id": id}, "article_updated")
	}
	utils.WriteJSON(w, 200, item)
}
func (h *Handler) deleteArticle(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		utils.WriteError(w, 400, "invalid id")
		return
	}
	actor := actorID(r)
	if err = h.svc.DeleteArticle(id, actor); err != nil {
		writeDomainError(w, err)
		return
	}
	h.emit(actor, "article_deleted", 0, map[string]any{"article_id": id})
	utils.WriteJSON(w, 200, map[string]string{"status": "deleted"})
}
