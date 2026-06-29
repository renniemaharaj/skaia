package ssr

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	icfg "github.com/skaia/backend/internal/config"
	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
	"github.com/skaia/backend/ratelimit"
)

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

func jailedWithoutBypass(ctx context.Context, r *http.Request, rdb *redis.Client) bool {
	reqCtx := r.Context()
	ip := utils.RealIP(r)

	if ratelimit.JailTimeRemaining(reqCtx, rdb, ip) <= 0 {
		return false
	}

	claims, ok := reqCtx.Value(ictx.CtxKeyClaims).(*ijwt.Claims)
	if !ok || claims == nil {
		return true
	}

	bypassKey := fmt.Sprintf("jail_bypass:%d", claims.UserID)
	active, _ := rdb.Exists(reqCtx, bypassKey).Result()

	return active <= 0
}

func getCachedMeta(ctx context.Context, rdb *redis.Client, key string) (CachedMeta, bool) {
	var meta CachedMeta

	cached, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return meta, false
	}

	if json.Unmarshal([]byte(cached), &meta) != nil {
		return meta, false
	}

	return meta, true
}

func setCachedMeta(ctx context.Context, rdb *redis.Client, key string, meta CachedMeta, ttl time.Duration) {
	b, err := json.Marshal(meta)
	if err != nil {
		return
	}

	_ = rdb.Set(ctx, key, b, ttl).Err()
}

func loadSiteConfig(cfgSvc *icfg.Service) (models.Branding, models.SEO) {
	var branding models.Branding
	var seo models.SEO

	if sc, err := cfgSvc.GetConfig("branding"); err == nil && sc != nil {
		_ = json.Unmarshal([]byte(sc.Value), &branding)
	}

	if sc, err := cfgSvc.GetConfig("seo"); err == nil && sc != nil {
		_ = json.Unmarshal([]byte(sc.Value), &seo)
	}

	return branding, seo
}

func resolveRouteSEO(db *sql.DB, path string) routeSEO {
	if match := threadRx.FindStringSubmatch(path); match != nil {
		return resolveThreadSEO(db, match[1])
	}

	if match := itemRx.FindStringSubmatch(path); match != nil {
		return resolveProductSEO(db, match[1])
	}

	if match := pageRx.FindStringSubmatch(path); match != nil {
		return resolvePageSEO(db, match[1])
	}

	return routeSEO{}
}

func resolveThreadSEO(db *sql.DB, idStr string) routeSEO {
	if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
		return routeSEO{Miss: true}
	}

	var title, content string
	err := db.QueryRow(
		"SELECT title, content FROM forum_threads WHERE id = $1",
		idStr,
	).Scan(&title, &content)

	if err != nil {
		return routeSEO{Miss: true}
	}

	return routeSEO{
		Title: title,
		Desc:  snip(stripHTML(content), 160),
	}
}

func resolveProductSEO(db *sql.DB, idStr string) routeSEO {
	if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
		return routeSEO{Miss: true}
	}

	var title, desc, img string
	err := db.QueryRow(
		"SELECT name, description, image_url FROM products WHERE id = $1",
		idStr,
	).Scan(&title, &desc, &img)

	if err != nil {
		return routeSEO{Miss: true}
	}

	return routeSEO{
		Title: title,
		Desc:  snip(stripHTML(desc), 160),
		Image: img,
	}
}

func resolvePageSEO(db *sql.DB, slug string) routeSEO {
	if len(slug) > 100 {
		return routeSEO{Miss: true}
	}

	var title, desc string
	err := db.QueryRow(
		"SELECT title, description FROM pages WHERE slug = $1",
		slug,
	).Scan(&title, &desc)

	if err != nil {
		return routeSEO{Miss: true}
	}

	return routeSEO{
		Title: title,
		Desc:  snip(stripHTML(desc), 160),
	}
}

func buildMeta(r *http.Request, branding models.Branding, seo models.SEO, route routeSEO) CachedMeta {
	var meta CachedMeta

	siteName := branding.SiteName
	if siteName == "" {
		siteName = branding.HeaderTitle
	}

	title := siteName
	if route.Title != "" {
		if siteName != "" {
			title = route.Title + " – " + siteName
		} else {
			title = route.Title
		}
	} else if branding.Tagline != "" {
		title = siteName + " – " + branding.Tagline
	}

	desc := route.Desc
	if desc == "" {
		desc = seo.Description
	}
	if desc == "" {
		desc = branding.Tagline
	}

	img := route.Image
	if img == "" {
		img = seo.OGImage
	}
	if img == "" {
		img = branding.LogoURL
	}

	img = absoluteURL(r, img)
	favicon := absoluteURL(r, branding.LogoURL)
	pageURL := absoluteURL(r, r.URL.Path)

	if title != "" {
		meta.setTitle(title)
	}

	if desc != "" {
		meta.setDescription(desc)
	}

	meta.setCanonical(pageURL)

	if img != "" {
		meta.setImage(img)

		imgMeta := detectImageMeta(r.Context(), img)
		meta.setImageMeta(imgMeta.Width, imgMeta.Height, imgMeta.MIME)
	}

	if favicon != "" {
		meta.setFavicon(favicon)
	}

	meta.setDefaults(siteName)

	return meta
}
