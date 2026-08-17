package seo

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"os"
	"regexp"
	"time"

	"github.com/redis/go-redis/v9"
	icfg "github.com/skaia/backend/internal/config"
	"github.com/skaia/backend/internal/seocache"
	log "github.com/skaia/backend/internal/syslog"
	"github.com/skaia/backend/models"
)

var (
	threadRx                     = regexp.MustCompile(`^/view-thread/(\d+)$`)
	itemRx                       = regexp.MustCompile(`^/store/product/(\d+)$`)
	pageRx                       = regexp.MustCompile(`^/page/([^/]+)$`)
	streamRx                     = regexp.MustCompile(`^/stream/([^/]+)$`)
	staticPageRx                 = regexp.MustCompile(`^/(privacy|tos)$`)
	usersRx                      = regexp.MustCompile(`^/users/?$`)
	userRx                       = regexp.MustCompile(`^/users/(\d+)$`)
	directoryRx                  = regexp.MustCompile(`^/directory/(\d+)$`)
	documentationRx              = regexp.MustCompile(`^/doc/([^/]+)$`)
	documentationArticleRx       = regexp.MustCompile(`^/doc/([^/]+)/([^/]+)$`)
	forumDocumentationCategoryRx = regexp.MustCompile(`^/forum/docs/\d+$`)
	forumDocumentationThreadRx   = regexp.MustCompile(`^/forum/docs/(\d+)/(\d+)$`)
	htmlTagRx                    = regexp.MustCompile(`<[^>]*>`)
	multiSpaceRx                 = regexp.MustCompile(`\s+`)
)

const (
	defaultIndexFilePath = "frontend/dist/index.html"
	retryAfterSeconds    = "5"
)

// routeSEO is the semantic metadata for one route. It contains no request
// origin and no rendered HTML.
type routeSEO struct {
	Title   string
	Desc    string
	Image   string
	Miss    bool
	Live    bool
	NoIndex bool
}

// resolutionState separates authoritative cacheable outcomes from temporary
// failures. A degraded result has authoritative route identity but lost an
// optional enrichment and is therefore safe to serve, but not to cache.
type resolutionState uint8

const (
	resolutionSuccess resolutionState = iota
	resolutionAbsence
	resolutionDegraded
	resolutionError
)

type seoResolution struct {
	Route routeSEO
	State resolutionState
	Err   error
}

type configProvider interface {
	GetConfig(key string) (*models.SiteConfig, error)
}

type metadataCache interface {
	Get(context.Context, string) (CachedMeta, bool, error)
	Set(context.Context, string, CachedMeta, time.Duration) error
}

type redisMetadataCache struct{ client *redis.Client }

func (c redisMetadataCache) Get(ctx context.Context, key string) (CachedMeta, bool, error) {
	return getCachedMetaResult(ctx, c.client, key)
}

func (c redisMetadataCache) Set(ctx context.Context, key string, meta CachedMeta, ttl time.Duration) error {
	return setCachedMeta(ctx, c.client, key, meta, ttl)
}

type handlerDependencies struct {
	config    configProvider
	cache     metadataCache
	resolve   func(context.Context, *http.Request) seoResolution
	readFile  func(string) ([]byte, error)
	indexPath string
}

// IndexHandler serves the hot-shipped SPA template with semantic SEO metadata.
// The template is intentionally read for every response: grengo may atomically
// replace it without reconstructing this singleton handler.
func IndexHandler(cfgSvc *icfg.Service, rdb *redis.Client, db *sql.DB) http.HandlerFunc {
	purgeCtx, cancelPurge := context.WithTimeout(context.Background(), 2*time.Second)
	if err := seocache.PurgeLegacy(purgeCtx, rdb); err != nil {
		log.Printf("seo: purge legacy cache: %v", err)
	}
	cancelPurge()

	queryer := sqlQueryer{db: db}
	return newIndexHandler(handlerDependencies{
		config:    cfgSvc,
		cache:     redisMetadataCache{client: rdb},
		resolve:   func(ctx context.Context, r *http.Request) seoResolution { return resolveRouteSEO(ctx, queryer, r) },
		readFile:  os.ReadFile,
		indexPath: configuredIndexPath(),
	})
}

func configuredIndexPath() string {
	if indexPath := os.Getenv("INDEX_FILE_PATH"); indexPath != "" {
		return indexPath
	}
	return defaultIndexFilePath
}

func newIndexHandler(deps handlerDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		indexHTML, err := deps.readFile(deps.indexPath)
		if err != nil {
			log.Printf("seo: failed to read index file %s: %v", deps.indexPath, err)
			serveUnavailable(w)
			return
		}

		ctx := r.Context()
		if jailedWithoutBypass(ctx, r, redisClient(deps.cache)) {
			serveInjected(w, r, indexHTML, CachedMeta{
				Version:     cachedMetaVersion,
				Title:       "Rate Limit Exceeded",
				Description: "You have been temporarily rate-limited. Please wait before accessing this page.",
				NoIndex:     true,
			}, http.StatusTooManyRequests)
			return
		}

		cacheKey := seocache.RouteKey(cacheRouteKey(r))
		if deps.cache != nil {
			meta, ok, cacheErr := deps.cache.Get(ctx, cacheKey)
			if cacheErr != nil {
				log.Printf("seo: read metadata cache: %v", cacheErr)
			} else if ok {
				serveInjected(w, r, indexHTML, meta, metaStatus(meta))
				return
			}
		}

		branding, siteSEO, configErr := loadSiteConfig(deps.config)
		if configErr != nil {
			log.Printf("seo: resolve site config: %v", configErr)
			serveUnavailable(w)
			return
		}

		resolution := deps.resolve(ctx, r)
		if resolution.State == resolutionError || resolution.Err != nil && resolution.State != resolutionDegraded {
			log.Printf("seo: resolve route %s: %v", r.URL.Path, resolution.Err)
			serveUnavailable(w)
			return
		}
		if resolution.State == resolutionDegraded && resolution.Err != nil {
			log.Printf("seo: optional route enrichment %s: %v", r.URL.Path, resolution.Err)
		}

		meta := buildMeta(branding, siteSEO, resolution.Route)
		if resolution.State == resolutionSuccess || resolution.State == resolutionAbsence {
			if ttl, cacheable := routeCacheTTL(resolution.Route); cacheable && deps.cache != nil {
				if err := deps.cache.Set(ctx, cacheKey, meta, ttl); err != nil {
					log.Printf("seo: write metadata cache: %v", err)
				}
			}
		}

		serveInjected(w, r, indexHTML, meta, metaStatus(meta))
	}
}

// redisClient exposes the production client only for the pre-existing jail
// check. Test caches deliberately do not impersonate Redis.
func redisClient(cache metadataCache) *redis.Client {
	if concrete, ok := cache.(redisMetadataCache); ok {
		return concrete.client
	}
	return nil
}

func serveUnavailable(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Retry-After", retryAfterSeconds)
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	http.Error(w, http.StatusText(http.StatusServiceUnavailable), http.StatusServiceUnavailable)
}

func routeCacheTTL(route routeSEO) (time.Duration, bool) {
	if route.Live {
		return 0, false
	}
	if route.Miss {
		return 5 * time.Minute, true
	}
	return 24 * time.Hour, true
}

func metaStatus(meta CachedMeta) int {
	if meta.NotFound {
		return http.StatusNotFound
	}
	return http.StatusOK
}

func dependencyFailure(err error) seoResolution {
	if err == nil {
		err = errors.New("unknown SEO dependency failure")
	}
	return seoResolution{State: resolutionError, Err: err}
}
