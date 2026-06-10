package mediascraper

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

func (h *Handler) Mount(r chi.Router, authMiddlewares ...func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		for _, m := range authMiddlewares {
			r.Use(m)
		}
		r.Get("/mediascraper/scrape", h.scrape)
		r.Get("/mediascraper/jobs", h.getJobs)
	})
}

func (h *Handler) getJobs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GetMetrics())
}

func (h *Handler) scrape(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	if targetURL == "" {
		http.Error(w, `{"error":"url is required"}`, http.StatusBadRequest)
		return
	}

	cached := GetCachedImages(targetURL)
	if cached != nil {
		recordCacheHit()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cached)
		return
	}

	_, authOK := utils.UserIDFromCtx(r)
	if !authOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":"this route requires authorization to fetch results"}`))
		return
	}

	result, err := ScrapeImages(targetURL)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
