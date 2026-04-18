package datasource

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
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
