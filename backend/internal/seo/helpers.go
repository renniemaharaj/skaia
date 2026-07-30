package seo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	icfg "github.com/skaia/backend/internal/config"
	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/streammeta"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
	"github.com/skaia/backend/ratelimit"
)

var (
	imageSrcRx           = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)
	youtubeRx            = regexp.MustCompile(`(?i)(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,})`)
	categoryRouteRx      = regexp.MustCompile(`^/threads/categories/\d+$`)
	kjvRouteRx           = regexp.MustCompile(`^/kjv/[^/]+/\d+/\d+/(?:open|closed)$`)
	privateRoutePatterns = []*regexp.Regexp{
		regexp.MustCompile(`^/edit-thread/\d+$`),
		regexp.MustCompile(`^/wallet/[^/]+$`),
		regexp.MustCompile(`^/store/orders/\d+$`),
		regexp.MustCompile(`^/admin/(?:meta(?:/.*)?|roles)$`),
		regexp.MustCompile(`^/datasources/\d+$`),
		regexp.MustCompile(`^/tmp/[^/]+$`),
		regexp.MustCompile(`^/settings(?:/.*)?$`),
	}
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
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	if max <= 3 {
		return string(runes[:max])
	}
	return string(runes[:max-3]) + "..."
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func cacheRouteKey(r *http.Request) string {
	if streamRx.MatchString(r.URL.Path) {
		if v := r.URL.Query().Get("v"); v != "" {
			return r.URL.Path + "?v=" + v
		}
	}
	return r.URL.Path
}

func replacePlaceholder(doc, placeholder, replacement string) string {
	return strings.ReplaceAll(doc, placeholder, replacement)
}

func htmlEscape(s string) string {
	return html.EscapeString(s)
}

func jailedWithoutBypass(ctx context.Context, r *http.Request, rdb *redis.Client) bool {
	if rdb == nil {
		return false
	}
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
	if rdb == nil {
		return meta, false
	}

	cached, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return meta, false
	}

	if json.Unmarshal([]byte(cached), &meta) != nil {
		return meta, false
	}
	if meta.Version != cachedMetaVersion {
		return CachedMeta{}, false
	}

	return meta, true
}

func setCachedMeta(ctx context.Context, rdb *redis.Client, key string, meta CachedMeta, ttl time.Duration) {
	if rdb == nil {
		return
	}
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

func resolveRouteSEO(db *sql.DB, r *http.Request) routeSEO {
	path := r.URL.Path

	if match := threadRx.FindStringSubmatch(path); match != nil {
		return resolveThreadSEO(db, r, match[1])
	}

	if match := itemRx.FindStringSubmatch(path); match != nil {
		return resolveProductSEO(db, match[1])
	}

	if match := pageRx.FindStringSubmatch(path); match != nil {
		return resolvePageSEO(db, match[1])
	}

	if match := streamRx.FindStringSubmatch(path); match != nil {
		return resolveStreamSEO(db, match[1])
	}

	if match := staticPageRx.FindStringSubmatch(path); match != nil {
		return resolvePageSEO(db, match[1])
	}

	if usersRx.MatchString(path) {
		return resolveUsersSEO(db)
	}

	if match := userRx.FindStringSubmatch(path); match != nil {
		return resolveUserSEO(db, match[1], "profile")
	}

	if match := directoryRx.FindStringSubmatch(path); match != nil {
		return resolveUserSEO(db, match[1], "directory")
	}

	if routeNoIndex(path) {
		return routeSEO{NoIndex: true}
	}
	if routeIsPublicShell(path) {
		return routeSEO{}
	}
	return routeSEO{Miss: true, NoIndex: true}
}

func resolveThreadSEO(db *sql.DB, r *http.Request, idStr string) routeSEO {
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

	image := firstNonEmpty(
		firstImageFromHTML(content),
		firstYouTubeThumbnailFromText(content),
		latestRouteMediaThumbnail(db, r.URL.Path),
	)

	return routeSEO{
		Title: title,
		Desc:  snip(stripHTML(content), 160),
		Image: image,
	}
}

func resolveProductSEO(db *sql.DB, idStr string) routeSEO {
	if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
		return routeSEO{Miss: true}
	}

	var title string
	var desc, img, media sql.NullString
	err := db.QueryRow(
		"SELECT name, description, image_url, media::text FROM products WHERE id = $1",
		idStr,
	).Scan(&title, &desc, &img, &media)

	if err != nil {
		return routeSEO{Miss: true}
	}

	return routeSEO{
		Title: title,
		Desc:  snip(stripHTML(desc.String), 160),
		Image: firstNonEmpty(img.String, firstImageFromJSON(media.String)),
	}
}

func resolvePageSEO(db *sql.DB, slug string) routeSEO {
	if len(slug) > 100 {
		return routeSEO{Miss: true}
	}

	var title, desc, content string
	err := db.QueryRow(
		"SELECT title, description, content::text FROM pages WHERE slug = $1 AND visibility IN ('public', 'unlisted')",
		slug,
	).Scan(&title, &desc, &content)

	if err != nil {
		return routeSEO{Miss: true}
	}

	return routeSEO{
		Title: title,
		Desc:  snip(stripHTML(desc), 160),
		Image: firstImageFromJSON(content),
	}
}

func resolveUsersSEO(db *sql.DB) routeSEO {
	var count int
	_ = db.QueryRow("SELECT COUNT(*) FROM users WHERE COALESCE(is_suspended, false) = false").Scan(&count)

	desc := "Browse community profiles and creators."
	if count > 0 {
		desc = fmt.Sprintf("Browse %d community profiles and creators.", count)
	}

	return routeSEO{
		Title: "User Directory",
		Desc:  desc,
	}
}

func resolveStreamSEO(db *sql.DB, id string) routeSEO {
	meta, ok := streammeta.DefaultStore.Get(id)
	if !ok {
		return routeSEO{Miss: true, Live: true}
	}

	image := streamOwnerImage(db, meta.OwnerID)
	if len(meta.Thumbnail) > 0 {
		image = "/stream-preview/" + meta.ID
		if meta.Revision != "" {
			image += "?v=" + meta.Revision
		}
	}

	return routeSEO{
		Title: firstNonEmpty(meta.Title, "Stream"),
		Desc:  snip(stripHTML(firstNonEmpty(meta.Description, "Watch this stream.")), 160),
		Image: image,
		Live:  true,
	}
}

func streamOwnerImage(db *sql.DB, ownerID int64) string {
	if ownerID <= 0 {
		return ""
	}

	var avatar, banner, photo, cardArt sql.NullString
	err := db.QueryRow(
		`SELECT avatar_url, banner_url, photo_url, profile_card_art_url
		   FROM users
		  WHERE id = $1 AND COALESCE(is_suspended, false) = false`,
		ownerID,
	).Scan(&avatar, &banner, &photo, &cardArt)
	if err != nil {
		return ""
	}

	return firstNonEmpty(avatar.String, banner.String, photo.String, cardArt.String)
}

func resolveUserSEO(db *sql.DB, idStr, kind string) routeSEO {
	if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
		return routeSEO{Miss: true}
	}

	var username string
	var displayName, bio, avatar, banner, photo, cardArt sql.NullString
	err := db.QueryRow(
		`SELECT username, display_name, bio, avatar_url, banner_url, photo_url, profile_card_art_url
		   FROM users
		  WHERE id = $1 AND COALESCE(is_suspended, false) = false`,
		idStr,
	).Scan(&username, &displayName, &bio, &avatar, &banner, &photo, &cardArt)
	if err != nil {
		return routeSEO{Miss: true}
	}

	name := firstNonEmpty(displayName.String, username)
	title := name
	desc := firstNonEmpty(bio.String, "View "+name+"'s profile.")
	if kind == "directory" {
		title = name + "'s Uploads"
		desc = firstNonEmpty(bio.String, "Browse uploads shared by "+name+".")
	}

	return routeSEO{
		Title: title,
		Desc:  snip(stripHTML(desc), 160),
		Image: firstNonEmpty(cardArt.String, avatar.String, banner.String, photo.String),
	}
}

func buildMeta(branding models.Branding, seo models.SEO, route routeSEO) CachedMeta {
	siteName := branding.SiteName
	if siteName == "" {
		siteName = branding.HeaderTitle
	}

	title := firstNonEmpty(seo.Title, siteName)
	if route.Title != "" {
		if siteName != "" {
			title = route.Title + " – " + siteName
		} else {
			title = route.Title
		}
	} else if seo.Title == "" && siteName != "" && branding.Tagline != "" {
		title = siteName + " – " + branding.Tagline
	} else if title == "" {
		title = branding.Tagline
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

	favicon := firstNonEmpty(branding.FaviconURL, branding.LogoURL)
	imageAlt := firstNonEmpty(title, siteName)
	if route.Miss {
		title = "Page Not Found"
		if siteName != "" {
			title += " – " + siteName
		}
		desc = "The requested page could not be found."
		img = ""
		imageAlt = ""
	}

	return CachedMeta{
		Version:     cachedMetaVersion,
		Title:       title,
		Description: desc,
		Image:       img,
		ImageAlt:    imageAlt,
		Favicon:     favicon,
		SiteName:    siteName,
		ImageMeta:   imageMetaFromReference(img),
		NotFound:    route.Miss,
		NoIndex:     route.NoIndex,
	}
}

func routeIsPublicShell(path string) bool {
	switch path {
	case "/", "/store", "/forum", "/kjv", "/pages", "/visualizer":
		return true
	}
	if categoryRouteRx.MatchString(path) {
		return true
	}
	return kjvRouteRx.MatchString(path)
}

func routeNoIndex(path string) bool {
	switch path {
	case "/new-thread", "/forum/new-category", "/store/new-product",
		"/store/new-category", "/cart", "/store/orders", "/inbox", "/deployments",
		"/datasources", "/activity", "/trash", "/flow", "/stream", "/clipmaker",
		"/login", "/register", "/verify-email", "/forgot-password", "/reset-password":
		return true
	}
	for _, pattern := range privateRoutePatterns {
		if pattern.MatchString(path) {
			return true
		}
	}
	return false
}

func firstImageFromHTML(s string) string {
	match := imageSrcRx.FindStringSubmatch(s)
	if match == nil {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func firstYouTubeThumbnailFromText(s string) string {
	match := youtubeRx.FindStringSubmatch(s)
	if match == nil {
		return ""
	}
	return youtubeThumbnail(match[1])
}

func youtubeThumbnail(videoID string) string {
	videoID = strings.TrimSpace(videoID)
	if videoID == "" {
		return ""
	}
	return "https://img.youtube.com/vi/" + videoID + "/hqdefault.jpg"
}

func latestRouteMediaThumbnail(db *sql.DB, route string) string {
	var videoID string
	err := db.QueryRow(
		`SELECT video_id FROM media_history WHERE route = $1 ORDER BY created_at DESC LIMIT 1`,
		route,
	).Scan(&videoID)
	if err != nil {
		return ""
	}
	return youtubeThumbnail(videoID)
}

func firstImageFromJSON(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return ""
	}

	return firstImageFromValue(value)
}

func firstImageFromValue(value any) string {
	switch v := value.(type) {
	case []any:
		for _, item := range v {
			if img := firstImageFromValue(item); img != "" {
				return img
			}
		}
	case map[string]any:
		for _, key := range []string{"image_url", "imageUrl", "image", "thumbnail", "thumbnail_url", "media", "avatar_url", "banner_url", "profile_card_art_url"} {
			if img := imageString(v[key]); img != "" {
				return img
			}
		}
		for _, item := range v {
			if img := firstImageFromValue(item); img != "" {
				return img
			}
		}
	}

	return ""
}

func imageString(value any) string {
	s, ok := value.(string)
	if !ok {
		return ""
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "data:") {
		return ""
	}
	lower := strings.ToLower(strings.Split(s, "?")[0])
	if strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") ||
		strings.HasSuffix(lower, ".png") || strings.HasSuffix(lower, ".gif") ||
		strings.HasSuffix(lower, ".webp") || strings.HasSuffix(lower, ".svg") ||
		strings.HasPrefix(s, "/uploads/") || strings.HasPrefix(s, "http://") ||
		strings.HasPrefix(s, "https://") {
		return s
	}
	return ""
}
