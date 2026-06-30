package streammeta

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
)

const maxThumbnailBytes = 384 * 1024

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	if store == nil {
		store = DefaultStore
	}
	return &Handler{store: store}
}

func (h *Handler) Mount(r chi.Router, auth func(http.Handler) http.Handler) {
	r.Get("/stream-meta/{id}", h.get)

	r.Group(func(sr chi.Router) {
		sr.Use(auth)
		sr.Post("/stream-meta", h.create)
		sr.Put("/stream-meta/{id}", h.update)
	})
}

func (h *Handler) MountPublic(r chi.Router) {
	r.Get("/stream-preview/{id}", h.preview)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(ictx.CtxKeyClaims).(*ijwt.Claims)
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	meta := h.store.Create(claims.UserID)
	writeJSON(w, meta)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	meta, ok := h.store.Get(chi.URLParam(r, "id"))
	if !ok {
		http.Error(w, `{"error":"stream_not_found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, meta)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(ictx.CtxKeyClaims).(*ijwt.Claims)
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Thumbnail   string `json:"thumbnail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
		return
	}

	thumb, mime := decodeDataURL(req.Thumbnail)
	if len(thumb) > maxThumbnailBytes {
		http.Error(w, `{"error":"thumbnail_too_large"}`, http.StatusRequestEntityTooLarge)
		return
	}

	meta, ok := h.store.Upsert(Update{
		ID:          chi.URLParam(r, "id"),
		OwnerID:     claims.UserID,
		Title:       req.Title,
		Description: req.Description,
		Thumbnail:   thumb,
		ThumbMIME:   mime,
	})
	if !ok {
		http.Error(w, `{"error":"stream_not_found_or_forbidden"}`, http.StatusForbidden)
		return
	}

	writeJSON(w, meta)
}

func (h *Handler) preview(w http.ResponseWriter, r *http.Request) {
	meta, ok := h.store.Get(chi.URLParam(r, "id"))
	if !ok || len(meta.Thumbnail) == 0 {
		http.NotFound(w, r)
		return
	}
	mime := meta.ThumbMIME
	if mime == "" {
		mime = "image/jpeg"
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(meta.Thumbnail)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func decodeDataURL(raw string) ([]byte, string) {
	if raw == "" || !strings.HasPrefix(raw, "data:image/") {
		return nil, ""
	}
	parts := strings.SplitN(raw, ",", 2)
	if len(parts) != 2 || !strings.Contains(parts[0], ";base64") {
		return nil, ""
	}
	mime := strings.TrimPrefix(strings.Split(parts[0], ";")[0], "data:")
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
		return nil, ""
	}
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ""
	}
	return data, mime
}
