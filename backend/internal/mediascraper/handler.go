package mediascraper

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/internal/user"
)

type Handler struct{
	userSvc *user.Service
}

func NewHandler(userSvc *user.Service) *Handler {
	return &Handler{userSvc: userSvc}
}

func (h *Handler) Mount(r chi.Router, authMiddlewares ...func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		for _, m := range authMiddlewares {
			r.Use(m)
		}
		r.Get("/mediascraper/scrape", h.scrape)
		r.Get("/mediascraper/jobs", h.getJobs)
		r.Post("/mediascraper/restart", h.restartJobs)
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

	if err := QueueScrape(targetURL); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"queued"}`))
}

func (h *Handler) restartJobs(w http.ResponseWriter, r *http.Request) {
	userID, authOK := utils.UserIDFromCtx(r)
	if !authOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":"unauthorized"}`))
		return
	}

	powerLevel, err := h.userSvc.GetUserMaxPowerLevel(userID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"failed to fetch user power level"}`))
		return
	}

	if powerLevel < 100 {
		client := getRedis()
		if client != nil {
			ctx := context.Background()
			key := fmt.Sprintf("mediascraper:ratelimit:restart:%d", userID)
			
			// Increment the counter
			count, err := client.Incr(ctx, key).Result()
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(`{"error":"failed to process rate limit"}`))
				return
			}
			
			// Set expiration to 1 hour on the first request
			if count == 1 {
				client.Expire(ctx, key, time.Hour)
			}
			
			if count > 5 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"Rate limit exceeded. You can only restart jobs 5 times per hour."}`))
				return
			}
		}
	}

	ClearJobsAndCache()
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}
