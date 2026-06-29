package mediascraper

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
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
		r.Get("/mediascraper/youtube", h.searchYouTube)
		r.Post("/mediascraper/restart", h.restartJobs)
	})
}

// validateScrapeURL ensures the URL uses http/https and does not point at
// private or loopback addresses (SSRF protection).
func validateScrapeURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("only http and https URLs are allowed")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL must contain a hostname")
	}
	// Block loopback and private IPs
	ip := net.ParseIP(host)
	if ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return fmt.Errorf("URLs targeting internal addresses are not allowed")
		}
	}
	// Block common internal hostnames
	if host == "localhost" || host == "metadata.google.internal" {
		return fmt.Errorf("URLs targeting internal addresses are not allowed")
	}
	return nil
}

// writeJSONError writes a safe JSON error response using json.Marshal to
// prevent injection through attacker-controlled error messages.
func writeJSONError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	resp := struct {
		Error string `json:"error"`
	}{Error: msg}
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) getJobs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GetMetrics())
}

func (h *Handler) scrape(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	if targetURL == "" {
		writeJSONError(w, "url is required", http.StatusBadRequest)
		return
	}

	if err := validateScrapeURL(targetURL); err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
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
		writeJSONError(w, "this route requires authorization to fetch results", http.StatusUnauthorized)
		return
	}

	if err := QueueScrape(targetURL); err != nil {
		writeJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"queued"}`))
}

func (h *Handler) restartJobs(w http.ResponseWriter, r *http.Request) {
	userID, authOK := utils.UserIDFromCtx(r)
	if !authOK {
		writeJSONError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	powerLevel, err := h.userSvc.GetUserMaxPowerLevel(userID)
	if err != nil {
		writeJSONError(w, "failed to fetch user power level", http.StatusInternalServerError)
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
				writeJSONError(w, "failed to process rate limit", http.StatusInternalServerError)
				return
			}
			
			// Set expiration to 1 hour on the first request
			if count == 1 {
				client.Expire(ctx, key, time.Hour)
			}
			
			if count > 5 {
				writeJSONError(w, "Rate limit exceeded. You can only restart jobs 5 times per hour.", http.StatusTooManyRequests)
				return
			}
		}
	}

	ClearJobsAndCache()
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func (h *Handler) searchYouTube(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeJSONError(w, "query is required", http.StatusBadRequest)
		return
	}

	_, authOK := utils.UserIDFromCtx(r)
	if !authOK {
		writeJSONError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	results, err := SearchYouTube(r.Context(), query)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
