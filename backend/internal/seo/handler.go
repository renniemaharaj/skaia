package seo

import (
	"database/sql"
	"net/http"
	"os"
	"regexp"
	"time"

	"github.com/redis/go-redis/v9"
	icfg "github.com/skaia/backend/internal/config"
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

// routeSEO represents the SEO metadata for a specific route, including title, description, image, and a flag indicating if the route was not found (Miss).
type routeSEO struct {
	Title string
	Desc  string
	Image string
	Miss  bool
	Live  bool
}

func seoClientPrefix() string {
	name := os.Getenv("CLIENT_NAME")
	if name == "" {
		return ""
	}
	return name + ":"
}

func IndexHandler(cfgSvc *icfg.Service, rdb *redis.Client, db *sql.DB) http.HandlerFunc {
	indexPath := os.Getenv("INDEX_FILE_PATH")
	if indexPath == "" {
		indexPath = "frontend/dist/index.html"
	}

	indexHTML, readErr := os.ReadFile(indexPath)
	if readErr != nil {
		log.Printf("seo: failed to read index file %s: %v", indexPath, readErr)
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if readErr != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		ctx := r.Context()

		if jailedWithoutBypass(ctx, r, rdb) {
			serveInjected(w, indexHTML, CachedMeta{
				TitleTag: "<title>Rate Limit Exceeded</title>",
				DescTag:  `<meta name="description" content="You have been temporarily rate-limited. Please wait before accessing this page.">`,
			})
			return
		}

		cacheKey := seoClientPrefix() + "ssr:meta:" + cacheRouteKey(r)

		if meta, ok := getCachedMeta(ctx, rdb, cacheKey); ok {
			serveInjected(w, indexHTML, meta)
			return
		}

		branding, seo := loadSiteConfig(cfgSvc)
		route := resolveRouteSEO(db, r)

		meta := buildMeta(r, branding, seo, route)

		ttl := 24 * time.Hour
		if route.Miss {
			ttl = 5 * time.Minute
		} else if route.Live {
			ttl = 15 * time.Second
		}
		setCachedMeta(ctx, rdb, cacheKey, meta, ttl)

		serveInjected(w, indexHTML, meta)
	}
}
