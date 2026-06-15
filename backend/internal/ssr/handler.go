package ssr

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	icfg "github.com/skaia/backend/internal/config"
	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/models"
	"github.com/skaia/backend/ratelimit"
	"net"
)

type CachedMeta struct {
	TitleTag   string `json:"title_tag"`
	DescTag    string `json:"desc_tag"`
	OGTag      string `json:"og_tag"`
	FaviconTag string `json:"favicon_tag"`
}

var (
	threadRx     = regexp.MustCompile(`^/view-thread/(\d+)`)
	itemRx       = regexp.MustCompile(`^/store/product/(\d+)`)
	pageRx       = regexp.MustCompile(`^/page/([^/]+)`)
	htmlTagRx    = regexp.MustCompile(`<[^>]*>`)
	multiSpaceRx = regexp.MustCompile(`\s+`)
)

func ssrClientPrefix() string {
	name := os.Getenv("CLIENT_NAME")
	if name == "" {
		return ""
	}
	return name + ":"
}

// realIP extracts the true client IP from the request.
func realIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		for i := 0; i < len(ip); i++ {
			if ip[i] == ',' {
				return ip[:i]
			}
		}
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// IndexHandler returns an http.HandlerFunc that serves the SPA index file
// with server-injected SEO/head tags based on the site config and route context.
func IndexHandler(cfgSvc *icfg.Service, rdb *redis.Client, db *sql.DB) http.HandlerFunc {
	indexPath := os.Getenv("INDEX_FILE_PATH")
	if indexPath == "" {
		indexPath = "frontend/dist/index.html"
	}

	return func(w http.ResponseWriter, r *http.Request) {
		data, err := ioutil.ReadFile(indexPath)
		if err != nil {
			log.Printf("ssr: failed to read index file %s: %v", indexPath, err)
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		path := r.URL.Path
		ip := realIP(r)
		cacheKey := ssrClientPrefix() + "ssr:meta:" + path
		ctx := r.Context()

		// 0. Fast path: if IP is jailed, skip SSR entirely to prevent Redis/DB flooding.
		// Serving the raw HTML allows the SPA to load and prompt the TOTP bypass.
		if ratelimit.JailTimeRemaining(ctx, rdb, ip) > 0 {
			hasBypass := false
			if claims, ok := ctx.Value(ictx.CtxKeyClaims).(*ijwt.Claims); ok && claims != nil {
				bypassKey := fmt.Sprintf("jail_bypass:%d", claims.UserID)
				if bypassActive, _ := rdb.Exists(ctx, bypassKey).Result(); bypassActive > 0 {
					hasBypass = true
				}
			}

			if !hasBypass {
				serveInjected(w, data, CachedMeta{
					TitleTag: "<title>Rate Limit Exceeded</title>",
					DescTag:  "<meta name=\"description\" content=\"You have been temporarily rate-limited. Please wait before accessing this page.\">",
				})
				return
			}
		}

		var meta CachedMeta

		// 1. Try to fetch from Redis
		if cached, err := rdb.Get(ctx, cacheKey).Result(); err == nil {
			if json.Unmarshal([]byte(cached), &meta) == nil {
				serveInjected(w, data, meta)
				return
			}
		}

		// 2. Cache miss: build meta
		var branding models.Branding
		var seo models.SEO

		if sc, err := cfgSvc.GetConfig("branding"); err == nil && sc != nil {
			_ = json.Unmarshal([]byte(sc.Value), &branding)
		}
		if sc, err := cfgSvc.GetConfig("seo"); err == nil && sc != nil {
			_ = json.Unmarshal([]byte(sc.Value), &seo)
		}

		siteName := branding.SiteName
		if siteName == "" {
			siteName = branding.HeaderTitle
		}

		var routeTitle, routeDesc, routeImg string
		var isMiss bool

		if match := threadRx.FindStringSubmatch(path); match != nil {
			idStr := match[1]
			if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
				isMiss = true
			} else {
				var content string
				err := db.QueryRow("SELECT title, content FROM forum_threads WHERE id = $1", idStr).Scan(&routeTitle, &content)
				if err != nil {
					isMiss = true
				} else if content != "" {
					routeDesc = snip(stripHTML(content), 160)
				}
			}
		} else if match := itemRx.FindStringSubmatch(path); match != nil {
			idStr := match[1]
			if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
				isMiss = true
			} else {
				err := db.QueryRow("SELECT name, description, image_url FROM products WHERE id = $1", idStr).Scan(&routeTitle, &routeDesc, &routeImg)
				if err != nil {
					isMiss = true
				} else if routeDesc != "" {
					routeDesc = snip(stripHTML(routeDesc), 160)
				}
			}
		} else if match := pageRx.FindStringSubmatch(path); match != nil {
			slug := match[1]
			if len(slug) > 100 {
				isMiss = true
			} else {
				err := db.QueryRow("SELECT title, description FROM pages WHERE slug = $1", slug).Scan(&routeTitle, &routeDesc)
				if err != nil {
					isMiss = true
				} else if routeDesc != "" {
					routeDesc = snip(stripHTML(routeDesc), 160)
				}
			}
		}

		// Title
		finalTitle := siteName
		if routeTitle != "" {
			if siteName != "" {
				finalTitle = routeTitle + " – " + siteName
			} else {
				finalTitle = routeTitle
			}
		} else if branding.Tagline != "" {
			finalTitle += " – " + branding.Tagline
		}

		if finalTitle != "" {
			meta.TitleTag = "<title>" + htmlEscape(finalTitle) + "</title>"
		}

		// Description
		finalDesc := routeDesc
		if finalDesc == "" {
			finalDesc = seo.Description
		}
		if finalDesc == "" {
			finalDesc = branding.Tagline
		}
		if finalDesc != "" {
			meta.DescTag = "<meta name=\"description\" content=\"" + htmlEscape(finalDesc) + "\">"
		}

		// OG Image
		finalImg := routeImg
		if finalImg == "" {
			finalImg = seo.OGImage
		}
		if finalImg == "" {
			finalImg = branding.LogoURL
		}
		if finalImg != "" {
			meta.OGTag = "<meta property=\"og:image\" content=\"" + htmlEscape(finalImg) + "\">"
		}

		// Favicon
		if branding.LogoURL != "" {
			meta.FaviconTag = "<link rel=\"icon\" href=\"" + htmlEscape(branding.LogoURL) + "\">"
		}

		// 3. Cache the result
		if metaBytes, err := json.Marshal(meta); err == nil {
			ttl := 24 * time.Hour
			if isMiss {
				ttl = 5 * time.Minute
			}
			rdb.Set(ctx, cacheKey, metaBytes, ttl)
		}

		serveInjected(w, data, meta)
	}
}

func serveInjected(w http.ResponseWriter, data []byte, meta CachedMeta) {
	out := string(data)
	out = replacePlaceholder(out, "%TITLE_PLACEHOLDER%", meta.TitleTag)
	out = replacePlaceholder(out, "%META_DESCRIPTION_PLACEHOLDER%", meta.DescTag)
	out = replacePlaceholder(out, "%OG_IMAGE_PLACEHOLDER%", meta.OGTag)
	out = replacePlaceholder(out, "%FAVICON_PLACEHOLDER%", meta.FaviconTag)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Write([]byte(out))
}

func stripHTML(s string) string {
	// Replace all HTML tags with a space to prevent words from mashing together
	s = htmlTagRx.ReplaceAllString(s, " ")
	// Unescape any HTML entities like &amp; back to normal text
	s = html.UnescapeString(s)
	// Collapse multiple spaces into one
	s = multiSpaceRx.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func snip(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func replacePlaceholder(doc, placeholder, replacement string) string {
	return strings.ReplaceAll(doc, placeholder, replacement)
}

func htmlEscape(s string) string {
	return html.EscapeString(s)
}
