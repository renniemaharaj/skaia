package seocache

import (
	"context"
	"fmt"
	"os"

	"github.com/redis/go-redis/v9"
)

const (
	legacyNamespace = "ssr:meta:"
	namespace       = "seo:meta:v2:"
)

func clientPrefix() string {
	if name := os.Getenv("CLIENT_NAME"); name != "" {
		return name + ":"
	}
	return ""
}

// RouteKey returns the tenant-scoped key for origin-independent route metadata.
func RouteKey(route string) string {
	return clientPrefix() + namespace + route
}

// InvalidateRoute removes one route's semantic SEO metadata.
func InvalidateRoute(ctx context.Context, rdb *redis.Client, route string) error {
	if rdb == nil {
		return nil
	}
	if err := rdb.Del(ctx, RouteKey(route)).Err(); err != nil {
		return fmt.Errorf("invalidate SEO route %q: %w", route, err)
	}
	return nil
}

// InvalidateAll removes all current SEO metadata for the active tenant.
func InvalidateAll(ctx context.Context, rdb *redis.Client) error {
	return deletePattern(ctx, rdb, clientPrefix()+namespace+"*")
}

// PurgeLegacy removes rendered metadata written by the old request-origin cache
// contract. The prefix is tenant-scoped and deliberately does not flush Redis.
func PurgeLegacy(ctx context.Context, rdb *redis.Client) error {
	return deletePattern(ctx, rdb, clientPrefix()+legacyNamespace+"*")
}

func deletePattern(ctx context.Context, rdb *redis.Client, pattern string) error {
	if rdb == nil {
		return nil
	}

	var cursor uint64
	for {
		keys, next, err := rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return fmt.Errorf("scan SEO cache pattern %q: %w", pattern, err)
		}
		if len(keys) > 0 {
			if err := rdb.Del(ctx, keys...).Err(); err != nil {
				return fmt.Errorf("delete SEO cache pattern %q: %w", pattern, err)
			}
		}
		cursor = next
		if cursor == 0 {
			return nil
		}
	}
}
