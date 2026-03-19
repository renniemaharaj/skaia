package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/models"
)

var productKeyPrefix = storeClientPrefix() + "store:product:"

const productTTL = 5 * time.Minute

func storeClientPrefix() string {
	name := os.Getenv("CLIENT_NAME")
	if name == "" {
		return ""
	}
	return name + ":"
}

// ProductCache is a Redis-backed per-ID store for Product objects.
type ProductCache struct {
	rdb *redis.Client
}

// NewProductCache returns a ProductCache connected to REDIS_URL.
func NewProductCache() *ProductCache {
	addr := os.Getenv("REDIS_URL")
	if addr == "" {
		log.Fatal("REDIS_URL is required")
	}
	opts, err := redis.ParseURL(addr)
	if err != nil {
		log.Fatalf("store.ProductCache: invalid REDIS_URL %q: %v", addr, err)
	}
	return &ProductCache{rdb: redis.NewClient(opts)}
}

// NewProductCacheWithClient creates a ProductCache from an existing client.
func NewProductCacheWithClient(rdb *redis.Client) *ProductCache {
	return &ProductCache{rdb: rdb}
}

func productKey(id int64) string {
	return productKeyPrefix + strconv.FormatInt(id, 10)
}

// GetByID returns the cached product or (nil, false) on miss/error.
func (c *ProductCache) GetByID(id int64) (*models.Product, bool) {
	data, err := c.rdb.Get(context.Background(), productKey(id)).Bytes()
	if err != nil {
		if err != redis.Nil {
			log.Printf("store.ProductCache.GetByID(%d): %v", id, err)
		}
		return nil, false
	}
	var p models.Product
	if err := json.Unmarshal(data, &p); err != nil {
		log.Printf("store.ProductCache.GetByID(%d): unmarshal: %v", id, err)
		return nil, false
	}
	return &p, true
}

// SetByID stores a product with a TTL of 5 minutes.
func (c *ProductCache) SetByID(id int64, p *models.Product) {
	data, err := json.Marshal(p)
	if err != nil {
		log.Printf("store.ProductCache.SetByID(%d): marshal: %v", id, err)
		return
	}
	if err := c.rdb.Set(context.Background(), productKey(id), data, productTTL).Err(); err != nil {
		log.Printf("store.ProductCache.SetByID(%d): %v", id, err)
	}
}

// Invalidate removes the cached entry for id.
func (c *ProductCache) Invalidate(id int64) {
	if err := c.rdb.Del(context.Background(), productKey(id)).Err(); err != nil {
		log.Printf("store.ProductCache.Invalidate(%d): %v", id, err)
	}
}

// Flush removes all store product cache entries.
func (c *ProductCache) Flush() {
	ctx := context.Background()
	pattern := fmt.Sprintf("%s*", productKeyPrefix)
	var cursor uint64
	for {
		keys, next, err := c.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			log.Printf("store.ProductCache.Flush: scan: %v", err)
			return
		}
		if len(keys) > 0 {
			if err := c.rdb.Del(ctx, keys...).Err(); err != nil {
				log.Printf("store.ProductCache.Flush: del: %v", err)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}
