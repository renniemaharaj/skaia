package forum

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
	threadKeyPrefix = "forum:thread:"
	threadTTL       = 5 * time.Minute
)

// ThreadCache is a Redis-backed per-ID store for ForumThread objects.
type ThreadCache struct {
	rdb *redis.Client
}

// NewThreadCache returns a ThreadCache connected to REDIS_URL (default redis://localhost:6379).
func NewThreadCache() *ThreadCache {
	addr := os.Getenv("REDIS_URL")
	if addr == "" {
		addr = "redis://localhost:6379"
	}
	opts, err := redis.ParseURL(addr)
	if err != nil {
		log.Fatalf("forum.ThreadCache: invalid REDIS_URL %q: %v", addr, err)
	}
	return &ThreadCache{rdb: redis.NewClient(opts)}
}

// NewThreadCacheWithClient creates a ThreadCache from an existing client.
func NewThreadCacheWithClient(rdb *redis.Client) *ThreadCache {
	return &ThreadCache{rdb: rdb}
}

func threadKey(id int64) string {
	return threadKeyPrefix + strconv.FormatInt(id, 10)
}

// GetByID returns the cached thread or (nil, false) on miss/error.
func (c *ThreadCache) GetByID(id int64) (*models.ForumThread, bool) {
	data, err := c.rdb.Get(context.Background(), threadKey(id)).Bytes()
	if err != nil {
		if err != redis.Nil {
			log.Printf("forum.ThreadCache.GetByID(%d): %v", id, err)
		}
		return nil, false
	}
	var t models.ForumThread
	if err := json.Unmarshal(data, &t); err != nil {
		log.Printf("forum.ThreadCache.GetByID(%d): unmarshal: %v", id, err)
		return nil, false
	}
	return &t, true
}

// SetByID stores a thread with a TTL of 5 minutes.
func (c *ThreadCache) SetByID(id int64, t *models.ForumThread) {
	data, err := json.Marshal(t)
	if err != nil {
		log.Printf("forum.ThreadCache.SetByID(%d): marshal: %v", id, err)
		return
	}
	if err := c.rdb.Set(context.Background(), threadKey(id), data, threadTTL).Err(); err != nil {
		log.Printf("forum.ThreadCache.SetByID(%d): %v", id, err)
	}
}

// Invalidate removes the cached entry for id.
func (c *ThreadCache) Invalidate(id int64) {
	if err := c.rdb.Del(context.Background(), threadKey(id)).Err(); err != nil {
		log.Printf("forum.ThreadCache.Invalidate(%d): %v", id, err)
	}
}

// Flush removes all forum thread cache entries.
func (c *ThreadCache) Flush() {
	pattern := fmt.Sprintf("%s*", threadKeyPrefix)
	keys, err := c.rdb.Keys(context.Background(), pattern).Result()
	if err != nil {
		log.Printf("forum.ThreadCache.Flush: %v", err)
		return
	}
	if len(keys) > 0 {
		if err := c.rdb.Del(context.Background(), keys...).Err(); err != nil {
			log.Printf("forum.ThreadCache.Flush: del: %v", err)
		}
	}
}
