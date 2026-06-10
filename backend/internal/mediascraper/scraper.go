package mediascraper

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/internal/ws"
)

var (
	singleton  *rod.Browser
	scrapeMu   sync.Mutex // Enforces conveyor belt processing
	rdb        *redis.Client
	rdbOnce    sync.Once
	activeJobs int32
	wsHub      *ws.Hub
)

func SetHub(hub *ws.Hub) {
	wsHub = hub
}

func ClearCache() {
	client := getRedis()
	if client == nil {
		return
	}
	ctx := context.Background()
	keys, err := client.Keys(ctx, "mediascraper:cache:*").Result()
	if err == nil && len(keys) > 0 {
		client.Del(ctx, keys...)
	}
}

func GetActiveJobs() int {
	return int(atomic.LoadInt32(&activeJobs))
}

type ScraperMetrics struct {
	ActiveJobs   int   `json:"active_jobs"`
	CacheHits1h  int64 `json:"cache_hits_1h"`
	NewScrapes1h int64 `json:"new_scrapes_1h"`
}

func GetMetrics() ScraperMetrics {
	client := getRedis()
	hits, scrapes := int64(0), int64(0)
	if client != nil {
		ctx := context.Background()
		now := time.Now().Unix()
		cutoff := fmt.Sprintf("%d", now-3600)
		client.ZRemRangeByScore(ctx, "mediascraper:stats:cache_hits", "-inf", cutoff)
		client.ZRemRangeByScore(ctx, "mediascraper:stats:new_scrapes", "-inf", cutoff)
		hits, _ = client.ZCard(ctx, "mediascraper:stats:cache_hits").Result()
		scrapes, _ = client.ZCard(ctx, "mediascraper:stats:new_scrapes").Result()
	}
	return ScraperMetrics{
		ActiveJobs:   GetActiveJobs(),
		CacheHits1h:  hits,
		NewScrapes1h: scrapes,
	}
}

func recordCacheHit() {
	client := getRedis()
	if client != nil {
		ctx := context.Background()
		now := time.Now().Unix()
		client.ZAdd(ctx, "mediascraper:stats:cache_hits", redis.Z{Score: float64(now), Member: time.Now().UnixNano()})
	}
	broadcastJobsUpdate()
}

func recordNewScrape() {
	client := getRedis()
	if client != nil {
		ctx := context.Background()
		now := time.Now().Unix()
		client.ZAdd(ctx, "mediascraper:stats:new_scrapes", redis.Z{Score: float64(now), Member: time.Now().UnixNano()})
	}
	broadcastJobsUpdate()
}

func broadcastJobsUpdate() {
	if wsHub == nil {
		return
	}
	metrics := GetMetrics()
	payload, _ := json.Marshal(metrics)
	wsHub.Broadcast(&ws.Message{Type: ws.MediaScraperJobs, Payload: payload})
}

func getRedis() *redis.Client {
	rdbOnce.Do(func() {
		addr := os.Getenv("REDIS_URL")
		if addr == "" {
			addr = "redis://redis:6379/0" // fallback
		}
		opts, err := redis.ParseURL(addr)
		if err == nil {
			rdb = redis.NewClient(opts)
		}
	})
	return rdb
}

func Get() *rod.Browser {
	if singleton == nil {
		path := launcher.New().
			Bin("/usr/bin/chromium-browser").
			Headless(true).
			Leakless(true).
			Set("disable-blink-features", "AutomationControlled").
			Set("no-sandbox", "true").
			MustLaunch()

		singleton = rod.New().ControlURL(path).MustConnect()
	}
	return singleton
}

func isLikelyThumbnail(src string) bool {
	lower := strings.ToLower(src)
	return !strings.Contains(lower, "logo") &&
		!strings.Contains(lower, "icon") &&
		!strings.Contains(lower, "svg") &&
		!strings.Contains(lower, "placeholder") &&
		(strings.HasSuffix(lower, ".jpg") ||
			strings.HasSuffix(lower, ".jpeg") ||
			strings.HasSuffix(lower, ".png") ||
			strings.HasSuffix(lower, ".webp") ||
			strings.HasSuffix(lower, ".gif"))
}

func resolveURL(link string, base string) string {
	uri, err := url.Parse(link)
	if err != nil {
		return link
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return link
	}
	return baseURL.ResolveReference(uri).String()
}

type ScrapeResult struct {
	Images      []string  `json:"images"`
	LastScanned time.Time `json:"last_scanned"`
}

func GetCachedImages(targetURL string) *ScrapeResult {
	redisKey := "mediascraper:cache:" + targetURL
	client := getRedis()

	if client != nil {
		if val, err := client.Get(context.Background(), redisKey).Result(); err == nil {
			var res ScrapeResult
			if json.Unmarshal([]byte(val), &res) == nil {
				return &res
			}
		}
	}
	return nil
}

func ScrapeImages(targetURL string) (*ScrapeResult, error) {
	if cached := GetCachedImages(targetURL); cached != nil {
		return cached, nil
	}

	atomic.AddInt32(&activeJobs, 1)
	broadcastJobsUpdate()
	defer func() {
		atomic.AddInt32(&activeJobs, -1)
		broadcastJobsUpdate()
	}()

	// Enforce conveyor belt: process one link at a time
	scrapeMu.Lock()
	defer scrapeMu.Unlock()

	// Double check cache after acquiring lock
	if cached := GetCachedImages(targetURL); cached != nil {
		recordCacheHit()
		return cached, nil
	}

	redisKey := "mediascraper:cache:" + targetURL
	client := getRedis()

	b := Get()
	page, err := b.Page(proto.TargetCreateTarget{URL: targetURL})
	if err != nil {
		return nil, err
	}
	defer page.Close()

	// Wait up to 10 seconds for the page to load, ignore error if it times out
	_ = page.Timeout(10 * time.Second).WaitLoad()

	// Try to get images, wait up to 5 seconds for at least one to appear
	imgEls, err := page.Timeout(5 * time.Second).Elements("img")
	if err != nil {
		// If it timed out or no images found, continue with an empty list
		imgEls = nil
	}

	var thumbs []string
	for _, img := range imgEls {
		src, _ := img.Attribute("src")
		if src != nil && *src != "" {
			resolved := resolveURL(*src, targetURL)
			if isLikelyThumbnail(resolved) || isLikelyThumbnail(*src) {
				thumbs = append(thumbs, resolved)
			}
		}
	}

	seen := make(map[string]bool)
	var result []string
	for _, t := range thumbs {
		if !seen[t] {
			seen[t] = true
			result = append(result, t)
		}
	}

	res := &ScrapeResult{
		Images:      result,
		LastScanned: time.Now(),
	}

	if client != nil {
		if b, err := json.Marshal(res); err == nil {
			client.Set(context.Background(), redisKey, string(b), 24*time.Hour)
		}
	}

	recordNewScrape()
	return res, nil
}
