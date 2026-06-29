package mediascraper

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	rdb        *redis.Client
	rdbOnce    sync.Once
)

type ScraperMetrics struct {
	ActiveJobs   int   `json:"active_jobs"`
	CacheHits1h  int64 `json:"cache_hits_1h"`
	NewScrapes1h int64 `json:"new_scrapes_1h"`
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

func getCacheKey(targetURL string) string {
	u, err := url.Parse(targetURL)
	if err == nil {
		u.RawQuery = ""
		u.Fragment = ""
		targetURL = strings.TrimRight(u.String(), "/")
	}
	hash := sha256.Sum256([]byte(targetURL))
	return fmt.Sprintf("mediascraper:cache:%x", hash)
}

func ClearCache() {
	client := getRedis()
	if client == nil {
		return
	}
	ctx := context.Background()
	
	var cursor uint64
	for {
		var keys []string
		var err error
		keys, cursor, err = client.Scan(ctx, cursor, "mediascraper:cache:*", 100).Result()
		if err != nil {
			break
		}
		if len(keys) > 0 {
			client.Del(ctx, keys...)
		}
		if cursor == 0 {
			break
		}
	}
	client.Del(ctx, "mediascraper:stats:cache_hits", "mediascraper:stats:new_scrapes")
}

func GetCachedImages(targetURL string) *ScrapeResult {
	redisKey := getCacheKey(targetURL)
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
