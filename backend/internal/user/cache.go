package user

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

const (
	cacheKeyPrefix = "user:"
	cacheTTL       = 5 * time.Minute
)

// Cache is a Redis-backed per-ID store for User objects.
type Cache struct {
	rdb *redis.Client
}

// NewCache returns a Cache connected to the Redis instance at REDIS_URL.
func NewCache() *Cache {
	addr := os.Getenv("REDIS_URL")
	if addr == "" {
		log.Fatal("REDIS_URL is required")
	}
	opts, err := redis.ParseURL(addr)
	if err != nil {
		log.Fatalf("user.Cache: invalid REDIS_URL %q: %v", addr, err)
	}
	return &Cache{rdb: redis.NewClient(opts)}
}

// NewCacheWithClient returns a Cache that uses the supplied Redis client.
func NewCacheWithClient(rdb *redis.Client) *Cache {
	return &Cache{rdb: rdb}
}

func cacheKey(id int64) string {
	return cacheKeyPrefix + strconv.FormatInt(id, 10)
}

// GetByID returns the cached user for the given id.
func (c *Cache) GetByID(id int64) (*models.User, bool) {
	ctx := context.Background()
	data, err := c.rdb.Get(ctx, cacheKey(id)).Bytes()
	if err != nil {
		// cache miss or error
		if err != redis.Nil {
			log.Printf("user.Cache.GetByID(%d): %v", id, err)
		}
		return nil, false
	}
	var u models.User
	if err := json.Unmarshal(data, &u); err != nil {
		log.Printf("user.Cache.GetByID(%d): unmarshal: %v", id, err)
		return nil, false
	}
	return &u, true
}

// SetByID stores the user for the given id with a 5 minute TTL.
func (c *Cache) SetByID(id int64, u *models.User) {
	data, err := json.Marshal(u)
	if err != nil {
		log.Printf("user.Cache.SetByID(%d): marshal: %v", id, err)
		return
	}
	ctx := context.Background()
	if err := c.rdb.Set(ctx, cacheKey(id), data, cacheTTL).Err(); err != nil {
		log.Printf("user.Cache.SetByID(%d): %v", id, err)
	}
}

// Invalidate removes the entry for id.
func (c *Cache) Invalidate(id int64) {
	ctx := context.Background()
	if err := c.rdb.Del(ctx, cacheKey(id)).Err(); err != nil {
		log.Printf("user.Cache.Invalidate(%d): %v", id, err)
	}
}

// Flush removes all user cache entries (keys matching "user:*").
func (c *Cache) Flush() {
	ctx := context.Background()
	pattern := fmt.Sprintf("%s*", cacheKeyPrefix)
	var cursor uint64
	for {
		keys, next, err := c.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			log.Printf("user.Cache.Flush: scan: %v", err)
			return
		}
		if len(keys) > 0 {
			if err := c.rdb.Del(ctx, keys...).Err(); err != nil {
				log.Printf("user.Cache.Flush: del: %v", err)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}
