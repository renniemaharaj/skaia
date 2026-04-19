package datasource

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const compileCacheTTL = 10 * time.Minute

var compileCachePrefix = datasourceClientPrefix() + "datasource:compile:"

func datasourceClientPrefix() string {
	name := os.Getenv("CLIENT_NAME")
	if name == "" {
		return ""
	}
	return name + ":"
}

func compileCacheKey(source string) string {
	hash := sha256.Sum256([]byte(source))
	return compileCachePrefix + hex.EncodeToString(hash[:])
}

// CompileCache stores TypeScript compilation results in Redis.
type CompileCache struct {
	rdb *redis.Client
}

// NewCompileCacheWithClient creates a CompileCache from an existing Redis client.
func NewCompileCacheWithClient(rdb *redis.Client) *CompileCache {
	return &CompileCache{rdb: rdb}
}

// Get returns a cached CompileResult if available.
func (c *CompileCache) Get(source string) (*CompileResult, bool) {
	data, err := c.rdb.Get(context.Background(), compileCacheKey(source)).Bytes()
	if err != nil {
		if err != redis.Nil {
			log.Printf("datasource.CompileCache.Get: %v", err)
		}
		return nil, false
	}

	var result CompileResult
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("datasource.CompileCache.Get: unmarshal: %v", err)
		return nil, false
	}
	result.Cached = true
	return &result, true
}

// Set stores a CompileResult in Redis.
func (c *CompileCache) Set(source string, result *CompileResult) {
	result.Cached = false
	data, err := json.Marshal(result)
	if err != nil {
		log.Printf("datasource.CompileCache.Set: marshal: %v", err)
		return
	}
	if err := c.rdb.Set(context.Background(), compileCacheKey(source), data, compileCacheTTL).Err(); err != nil {
		log.Printf("datasource.CompileCache.Set: %v", err)
	}
}

// ── ExecuteCache ─────────────────────────────────────────────────────────────

var executeCachePrefix = datasourceClientPrefix() + "datasource:exec:"

func executeCacheKey(dsID int64) string {
	return executeCachePrefix + strconv.FormatInt(dsID, 10)
}

// CachedExecuteResult wraps an ExecuteResult with a timestamp for UI display.
type CachedExecuteResult struct {
	ExecuteResult
	CachedAt time.Time `json:"cached_at"`
	CacheTTL int       `json:"cache_ttl"`
}

// ExecuteCache stores datasource execution results in Redis.
type ExecuteCache struct {
	rdb *redis.Client
}

// NewExecuteCacheWithClient creates an ExecuteCache from an existing Redis client.
func NewExecuteCacheWithClient(rdb *redis.Client) *ExecuteCache {
	return &ExecuteCache{rdb: rdb}
}

// Get returns a cached ExecuteResult if available.
func (c *ExecuteCache) Get(dsID int64) (*CachedExecuteResult, bool) {
	data, err := c.rdb.Get(context.Background(), executeCacheKey(dsID)).Bytes()
	if err != nil {
		if err != redis.Nil {
			log.Printf("datasource.ExecuteCache.Get: %v", err)
		}
		return nil, false
	}
	var result CachedExecuteResult
	if err := json.Unmarshal(data, &result); err != nil {
		log.Printf("datasource.ExecuteCache.Get: unmarshal: %v", err)
		return nil, false
	}
	return &result, true
}

// Set stores an ExecuteResult in Redis with the given TTL.
func (c *ExecuteCache) Set(dsID int64, result *ExecuteResult, ttl time.Duration) {
	cached := CachedExecuteResult{
		ExecuteResult: *result,
		CachedAt:      time.Now(),
		CacheTTL:      int(ttl.Seconds()),
	}
	data, err := json.Marshal(cached)
	if err != nil {
		log.Printf("datasource.ExecuteCache.Set: marshal: %v", err)
		return
	}
	if err := c.rdb.Set(context.Background(), executeCacheKey(dsID), data, ttl).Err(); err != nil {
		log.Printf("datasource.ExecuteCache.Set: %v", err)
	}
}

// Invalidate removes the cached execution result for a datasource.
func (c *ExecuteCache) Invalidate(dsID int64) {
	if err := c.rdb.Del(context.Background(), executeCacheKey(dsID)).Err(); err != nil && err != redis.Nil {
		log.Printf("datasource.ExecuteCache.Invalidate: %v", err)
	}
}
