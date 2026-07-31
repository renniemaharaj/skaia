package seo

import (
	"context"
	"database/sql"
	"net/http"
	"os"
	"regexp"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	icfg "github.com/skaia/backend/internal/config"
	"github.com/skaia/backend/internal/seocache"
	log "github.com/skaia/backend/internal/syslog"
)

var (
	threadRx     = regexp.MustCompile(`^/view-thread/(\d+)$`)
	itemRx       = regexp.MustCompile(`^/store/product/(\d+)$`)
	pageRx       = regexp.MustCompile(`^/page/([^/]+)$`)
	streamRx     = regexp.MustCompile(`^/stream/([^/]+)$`)
	staticPageRx = regexp.MustCompile(`^/(privacy|tos)$`)
	usersRx      = regexp.MustCompile(`^/users/?$`)
	userRx       = regexp.MustCompile(`^/users/(\d+)$`)
	directoryRx  = regexp.MustCompile(`^/directory/(\d+)$`)
	htmlTagRx    = regexp.MustCompile(`<[^>]*>`)
	multiSpaceRx = regexp.MustCompile(`\s+`)
)

// routeSEO represents the SEO metadata for a specific route, including title,
// description, image, and whether the route was not found.
type routeSEO struct {
	Title   string
	Desc    string
	Image   string
	Miss    bool
	Live    bool
	NoIndex bool
}

func IndexHandler(cfgSvc *icfg.Service, rdb *redis.Client, db *sql.DB) http.HandlerFunc {
	indexPath := "/app/frontend/dist/index.html"

	var (
		indexHTML []byte
		indexMu   sync.RWMutex
	)

	loadIndexHTML := func() ([]byte, error) {
		indexMu.RLock()
		html := indexHTML
		indexMu.RUnlock()

		if html != nil {
			return html, nil
		}

		html, err := os.ReadFile(indexPath)
		if err != nil {
			return nil, err
		}

		indexMu.Lock()
		if indexHTML == nil {
			indexHTML = html
		} else {
			html = indexHTML
		}
		indexMu.Unlock()

		return html, nil
	}

	purgeCtx, cancelPurge := context.WithTimeout(context.Background(), 2*time.Second)
	if err := seocache.PurgeLegacy(purgeCtx, rdb); err != nil {
		log.Printf("seo: purge legacy cache: %v", err)
	}
	cancelPurge()

	return func(w http.ResponseWriter, r *http.Request) {
		indexHTML, err := loadIndexHTML()
		if err != nil {
			log.Printf("seo: failed to read index file %s: %v", indexPath, err)
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		ctx := r.Context()

		if jailedWithoutBypass(ctx, r, rdb) {
			serveInjected(w, r, indexHTML, CachedMeta{
				Version:     cachedMetaVersion,
				Title:       "Rate Limit Exceeded",
				Description: "You have been temporarily rate-limited. Please wait before accessing this page.",
				NoIndex:     true,
			}, http.StatusTooManyRequests)
			return
		}

		cacheKey := seocache.RouteKey(cacheRouteKey(r))

		if meta, ok := getCachedMeta(ctx, rdb, cacheKey); ok {
			serveInjected(w, r, indexHTML, meta, metaStatus(meta))
			return
		}

		branding, seo := loadSiteConfig(cfgSvc)
		route := resolveRouteSEO(db, r)
		meta := buildMeta(branding, seo, route)

		if ttl, cacheable := routeCacheTTL(route); cacheable {
			setCachedMeta(ctx, rdb, cacheKey, meta, ttl)
		}

		serveInjected(w, r, indexHTML, meta, metaStatus(meta))
	}
}

func routeCacheTTL(route routeSEO) (time.Duration, bool) {
	// Stream titles, descriptions, thumbnails, and existence can change without
	// a database mutation path. Resolve them on every SSR request instead of
	// allowing a stale or missing stream entry to outlive the live state.
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
