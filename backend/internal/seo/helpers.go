package seo

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
	istatus "github.com/skaia/backend/internal/status"
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
		regexp.MustCompile(`^/doc/manage/[^/]+/(?:settings|guides/(?:new|[^/]+))$`),
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

func getCachedMetaResult(ctx context.Context, rdb *redis.Client, key string) (CachedMeta, bool, error) {
	var meta CachedMeta
	if rdb == nil {
		return meta, false, nil
	}

	cached, err := rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		return meta, false, nil
	}
	if err != nil {
		return meta, false, err
	}

	if err := json.Unmarshal([]byte(cached), &meta); err != nil {
		return meta, false, err
	}
	if meta.Version != cachedMetaVersion {
		return CachedMeta{}, false, nil
	}

	return meta, true, nil
}

func setCachedMeta(ctx context.Context, rdb *redis.Client, key string, meta CachedMeta, ttl time.Duration) error {
	if rdb == nil {
		return nil
	}
	b, err := json.Marshal(meta)
	if err != nil {
		return err
	}

	return rdb.Set(ctx, key, b, ttl).Err()
}

func loadSiteConfig(cfgSvc configProvider) (models.Branding, models.SEO, error) {
	var branding models.Branding
	var seo models.SEO
	if cfgSvc == nil {
		return branding, seo, errors.New("SEO config provider is unavailable")
	}

	if sc, err := cfgSvc.GetConfig("branding"); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return branding, seo, fmt.Errorf("load branding: %w", err)
	} else if err == nil && sc != nil {
		if err := json.Unmarshal([]byte(sc.Value), &branding); err != nil {
			return branding, seo, fmt.Errorf("decode branding: %w", err)
		}
	}

	if sc, err := cfgSvc.GetConfig("seo"); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return branding, seo, fmt.Errorf("load SEO config: %w", err)
	} else if err == nil && sc != nil {
		if err := json.Unmarshal([]byte(sc.Value), &seo); err != nil {
			return branding, seo, fmt.Errorf("decode SEO config: %w", err)
		}
	}

	return branding, seo, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

type rowQueryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) rowScanner
}

type sqlQueryer struct{ db *sql.DB }

func (q sqlQueryer) QueryRowContext(ctx context.Context, query string, args ...any) rowScanner {
	if q.db == nil {
		return errorRow{err: errors.New("SEO database is unavailable")}
	}
	return q.db.QueryRowContext(ctx, query, args...)
}

type errorRow struct{ err error }

func (r errorRow) Scan(...any) error { return r.err }

func resolveRouteSEO(ctx context.Context, db rowQueryer, r *http.Request) seoResolution {
	path := r.URL.Path
	if routeNoIndex(path) {
		return seoResolution{Route: routeSEO{NoIndex: true}, State: resolutionSuccess}
	}

	if match := documentationArticleRx.FindStringSubmatch(path); match != nil {
		return resolveDocumentationArticleSEO(ctx, db, match[1], match[2])
	}
	if match := documentationRx.FindStringSubmatch(path); match != nil {
		return resolveDocumentationSEO(ctx, db, match[1])
	}
	if match := forumDocumentationThreadRx.FindStringSubmatch(path); match != nil {
		return resolveThreadSEO(ctx, db, r, match[2])
	}

	if match := threadRx.FindStringSubmatch(path); match != nil {
		return resolveThreadSEO(ctx, db, r, match[1])
	}

	if match := itemRx.FindStringSubmatch(path); match != nil {
		return resolveProductSEO(ctx, db, match[1])
	}

	if match := pageRx.FindStringSubmatch(path); match != nil {
		return resolvePageSEO(ctx, db, match[1])
	}

	if match := streamRx.FindStringSubmatch(path); match != nil {
		return resolveStreamSEO(ctx, db, match[1])
	}

	if match := staticPageRx.FindStringSubmatch(path); match != nil {
		return resolvePageSEO(ctx, db, match[1])
	}
	if path == "/" {
		return resolveLandingPageSEO(ctx, db)
	}

	if usersRx.MatchString(path) {
		return resolveUsersSEO(ctx, db)
	}

	if match := userRx.FindStringSubmatch(path); match != nil {
		return resolveUserSEO(ctx, db, match[1], "profile")
	}

	if match := directoryRx.FindStringSubmatch(path); match != nil {
		return resolveUserSEO(ctx, db, match[1], "directory")
	}

	if routeIsPublicShell(path) {
		return seoResolution{State: resolutionSuccess}
	}
	return absentRoute(routeSEO{Miss: true, NoIndex: true})
}

func resolveDocumentationSEO(ctx context.Context, db rowQueryer, slug string) seoResolution {
	if len(slug) > 120 {
		return absentRoute(routeSEO{Miss: true})
	}
	var title, description string
	err := db.QueryRowContext(ctx, `SELECT title,description FROM documentations
		WHERE LOWER(slug)=LOWER($1) AND visibility IN ('public','unlisted') AND deleted_at IS NULL`, slug).Scan(&title, &description)
	if errors.Is(err, sql.ErrNoRows) {
		return absentRoute(routeSEO{Miss: true})
	}
	if err != nil {
		return dependencyFailure(err)
	}
	return seoResolution{Route: routeSEO{Title: title, Desc: snip(stripHTML(description), 160)}, State: resolutionSuccess}
}

func resolveDocumentationArticleSEO(ctx context.Context, db rowQueryer, docSlug, articleSlug string) seoResolution {
	if len(docSlug) > 120 || len(articleSlug) > 120 {
		return absentRoute(routeSEO{Miss: true})
	}
	var title, summary, content string
	err := db.QueryRowContext(ctx, `SELECT a.title,a.summary,a.content FROM documentation_articles a
		JOIN documentations d ON d.id=a.documentation_id AND d.deleted_at IS NULL
		WHERE LOWER(d.slug)=LOWER($1) AND LOWER(a.slug)=LOWER($2)
		AND d.visibility IN ('public','unlisted') AND a.deleted_at IS NULL`, docSlug, articleSlug).Scan(&title, &summary, &content)
	if errors.Is(err, sql.ErrNoRows) {
		return absentRoute(routeSEO{Miss: true})
	}
	if err != nil {
		return dependencyFailure(err)
	}
	return seoResolution{Route: routeSEO{
		Title: title,
		Desc:  snip(firstNonEmpty(stripHTML(summary), stripHTML(content)), 160),
		Image: firstImageFromHTML(content),
	}, State: resolutionSuccess}
}

func resolveThreadSEO(ctx context.Context, db rowQueryer, r *http.Request, idStr string) seoResolution {
	if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
		return absentRoute(routeSEO{Miss: true})
	}

	var title, content string
	err := db.QueryRowContext(ctx,
		`SELECT ft.title, ft.content FROM forum_threads ft
		 JOIN forum_categories fc ON fc.id=ft.category_id AND fc.deleted_at IS NULL
		 WHERE ft.id=$1 AND ft.deleted_at IS NULL`,
		idStr,
	).Scan(&title, &content)
	if errors.Is(err, sql.ErrNoRows) {
		return absentRoute(routeSEO{Miss: true})
	}
	if err != nil {
		return dependencyFailure(err)
	}

	result := seoResolution{Route: routeSEO{
		Title: title,
		Desc:  snip(stripHTML(content), 160),
		Image: firstNonEmpty(firstImageFromHTML(content), firstYouTubeThumbnailFromText(content)),
	}, State: resolutionSuccess}
	if result.Route.Image != "" {
		return result
	}
	image, err := latestRouteMediaThumbnail(ctx, db, r.URL.Path)
	if err != nil {
		result.State = resolutionDegraded
		result.Err = err
		return result
	}
	result.Route.Image = image
	return result
}

func resolveProductSEO(ctx context.Context, db rowQueryer, idStr string) seoResolution {
	if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
		return absentRoute(routeSEO{Miss: true})
	}

	var title string
	var desc, img, media sql.NullString
	err := db.QueryRowContext(ctx,
		"SELECT name, description, image_url, media::text FROM products WHERE id = $1",
		idStr,
	).Scan(&title, &desc, &img, &media)
	if errors.Is(err, sql.ErrNoRows) {
		return absentRoute(routeSEO{Miss: true})
	}
	if err != nil {
		return dependencyFailure(err)
	}

	mediaImage, mediaErr := firstImageFromJSONResult(media.String)
	result := seoResolution{Route: routeSEO{
		Title: title,
		Desc:  snip(stripHTML(desc.String), 160),
		Image: firstNonEmpty(img.String, mediaImage),
	}, State: resolutionSuccess}
	if mediaErr != nil && strings.TrimSpace(img.String) == "" {
		result.State = resolutionDegraded
		result.Err = fmt.Errorf("decode product media: %w", mediaErr)
	}
	return result
}

func resolvePageSEO(ctx context.Context, db rowQueryer, slug string) seoResolution {
	if len(slug) > 100 {
		return absentRoute(routeSEO{Miss: true})
	}

	var title, desc, seoTitle, seoDesc, seoImage, content string
	err := db.QueryRowContext(ctx,
		"SELECT title,description,seo_title,seo_description,seo_image,content::text FROM pages WHERE slug = $1 AND visibility IN ('public', 'unlisted') AND deleted_at IS NULL",
		slug,
	).Scan(&title, &desc, &seoTitle, &seoDesc, &seoImage, &content)
	if errors.Is(err, sql.ErrNoRows) {
		return absentRoute(routeSEO{Miss: true})
	}
	if err != nil {
		return dependencyFailure(err)
	}
	return resolvePageSEOContent(title, desc, seoTitle, seoDesc, seoImage, content)
}

func resolveLandingPageSEO(ctx context.Context, db rowQueryer) seoResolution {
	var slug, title, desc, seoTitle, seoDesc, seoImage, content string
	err := db.QueryRowContext(ctx, `SELECT p.slug,p.title,p.description,p.seo_title,p.seo_description,p.seo_image,p.content::text
		FROM site_config sc JOIN pages p ON p.slug=(sc.value #>> '{}')
		WHERE sc.key='landing_page_slug' AND sc.deleted_at IS NULL
		AND p.visibility IN ('public','unlisted') AND p.deleted_at IS NULL`).Scan(&slug, &title, &desc, &seoTitle, &seoDesc, &seoImage, &content)
	if errors.Is(err, sql.ErrNoRows) {
		// Sites without a configured public landing page retain their ordinary
		// global home metadata rather than turning the application shell into a 404.
		return seoResolution{State: resolutionSuccess}
	}
	if err != nil {
		return dependencyFailure(err)
	}
	return resolvePageSEOContent(title, desc, seoTitle, seoDesc, seoImage, content)
}

func resolvePageSEOContent(title, desc, seoTitle, seoDesc, seoImage, content string) seoResolution {
	contentMeta, contentErr := extractPageContentSEO(content)
	pageTitle := firstNonEmpty(stripHTML(seoTitle), stripHTML(title), contentMeta.Title)
	pageDesc := firstNonEmpty(stripHTML(seoDesc), stripHTML(desc), contentMeta.Desc)
	result := seoResolution{Route: routeSEO{
		Title: pageTitle,
		Desc:  snip(pageDesc, 160),
		Image: firstNonEmpty(seoImage, contentMeta.Image),
	}, State: resolutionSuccess}
	if contentErr != nil {
		result.State = resolutionDegraded
		result.Err = fmt.Errorf("decode page content: %w", contentErr)
	}
	return result
}

func resolveUsersSEO(ctx context.Context, db rowQueryer) seoResolution {
	var count int
	err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE COALESCE(is_suspended, false) = false").Scan(&count)

	desc := "Browse community profiles and creators."
	if err == nil && count > 0 {
		desc = fmt.Sprintf("Browse %d community profiles and creators.", count)
	}

	result := seoResolution{Route: routeSEO{
		Title: "User Directory",
		Desc:  desc,
	}, State: resolutionSuccess}
	if err != nil {
		result.State = resolutionDegraded
		result.Err = fmt.Errorf("count directory users: %w", err)
	}
	return result
}

func resolveStreamSEO(ctx context.Context, db rowQueryer, id string) seoResolution {
	meta, ok := streammeta.DefaultStore.Get(id)
	if !ok {
		return absentRoute(routeSEO{Miss: true, Live: true})
	}

	image := ""
	var enrichmentErr error
	if len(meta.Thumbnail) > 0 {
		image = "/stream-preview/" + meta.ID
		if meta.Revision != "" {
			image += "?v=" + meta.Revision
		}
	} else {
		image, enrichmentErr = streamOwnerImage(ctx, db, meta.OwnerID)
	}

	result := seoResolution{Route: routeSEO{
		Title: firstNonEmpty(meta.Title, "Stream"),
		Desc:  snip(stripHTML(firstNonEmpty(meta.Description, "Watch this stream.")), 160),
		Image: image,
		Live:  true,
	}, State: resolutionSuccess}
	if enrichmentErr != nil {
		result.State = resolutionDegraded
		result.Err = enrichmentErr
	}
	return result
}

func streamOwnerImage(ctx context.Context, db rowQueryer, ownerID int64) (string, error) {
	if ownerID <= 0 {
		return "", nil
	}

	var avatar, banner, photo, cardArt sql.NullString
	err := db.QueryRowContext(ctx,
		`SELECT avatar_url, banner_url, photo_url, profile_card_art_url
		   FROM users
		  WHERE id = $1 AND COALESCE(is_suspended, false) = false`,
		ownerID,
	).Scan(&avatar, &banner, &photo, &cardArt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("load stream owner image: %w", err)
	}

	return firstNonEmpty(avatar.String, banner.String, photo.String, cardArt.String), nil
}

func resolveUserSEO(ctx context.Context, db rowQueryer, idStr, kind string) seoResolution {
	if _, err := strconv.ParseInt(idStr, 10, 64); err != nil {
		return absentRoute(routeSEO{Miss: true})
	}

	var username string
	var displayName, bio, avatar, banner, photo, cardArt sql.NullString
	err := db.QueryRowContext(ctx,
		`SELECT username, display_name, bio, avatar_url, banner_url, photo_url, profile_card_art_url
		   FROM users
		  WHERE id = $1 AND COALESCE(is_suspended, false) = false`,
		idStr,
	).Scan(&username, &displayName, &bio, &avatar, &banner, &photo, &cardArt)
	if errors.Is(err, sql.ErrNoRows) {
		return absentRoute(routeSEO{Miss: true})
	}
	if err != nil {
		return dependencyFailure(err)
	}

	name := firstNonEmpty(displayName.String, username)
	title := name
	desc := firstNonEmpty(bio.String, "View "+name+"'s profile.")
	if kind == "directory" {
		title = name + "'s Uploads"
		desc = firstNonEmpty(bio.String, "Browse uploads shared by "+name+".")
	}

	return seoResolution{Route: routeSEO{
		Title: title,
		Desc:  snip(stripHTML(desc), 160),
		Image: firstNonEmpty(cardArt.String, avatar.String, banner.String, photo.String),
	}, State: resolutionSuccess}
}

func absentRoute(route routeSEO) seoResolution {
	route.Miss = true
	return seoResolution{Route: route, State: resolutionAbsence}
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
	if path == "/status" {
		return istatus.PublicEnabled()
	}
	switch path {
	case "/", "/store", "/forum", "/forum/docs", "/doc", "/kjv", "/pages", "/visualizer":
		return true
	}
	if forumDocumentationCategoryRx.MatchString(path) {
		return true
	}
	if categoryRouteRx.MatchString(path) {
		return true
	}
	return kjvRouteRx.MatchString(path)
}

func routeNoIndex(path string) bool {
	switch path {
	case "/new-thread", "/forum/new-category", "/store/new-product", "/doc/new",
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

func latestRouteMediaThumbnail(ctx context.Context, db rowQueryer, route string) (string, error) {
	var videoID string
	err := db.QueryRowContext(ctx,
		`SELECT video_id FROM media_history WHERE route = $1 ORDER BY created_at DESC LIMIT 1`,
		route,
	).Scan(&videoID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("load route media thumbnail: %w", err)
	}
	return youtubeThumbnail(videoID), nil
}

func firstImageFromJSONResult(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}

	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return "", err
	}

	return firstImageFromValue(value), nil
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
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			if img := firstImageFromValue(v[key]); img != "" {
				return img
			}
		}
	}

	return ""
}

type pageContentSEO struct {
	Title string
	Desc  string
	Image string
}

type pageSEOSection struct {
	DisplayOrder int             `json:"display_order"`
	SectionType  string          `json:"section_type"`
	Heading      string          `json:"heading"`
	Subheading   string          `json:"subheading"`
	Config       json.RawMessage `json:"config"`
	Items        []pageSEOItem   `json:"items"`
	position     int
}

type pageSEOItem struct {
	DisplayOrder int    `json:"display_order"`
	Heading      string `json:"heading"`
	Subheading   string `json:"subheading"`
	ImageURL     string `json:"image_url"`
}

// extractPageContentSEO understands the page-builder document instead of
// treating it as arbitrary JSON. This keeps text selection relevant and makes
// social-image priority stable as the document grows new presentation fields.
func extractPageContentSEO(raw string) (pageContentSEO, error) {
	var meta pageContentSEO
	if strings.TrimSpace(raw) == "" {
		return meta, nil
	}

	var sections []pageSEOSection
	if err := json.Unmarshal([]byte(raw), &sections); err != nil {
		return meta, err
	}
	for i := range sections {
		sections[i].position = i
		sort.SliceStable(sections[i].Items, func(a, b int) bool {
			return sections[i].Items[a].DisplayOrder < sections[i].Items[b].DisplayOrder
		})
	}
	sort.SliceStable(sections, func(i, j int) bool {
		if sections[i].DisplayOrder == sections[j].DisplayOrder {
			return sections[i].position < sections[j].position
		}
		return sections[i].DisplayOrder < sections[j].DisplayOrder
	})

	configs := make([]any, len(sections))
	for i, section := range sections {
		config, err := decodePageSectionConfig(section.Config)
		if err != nil {
			return meta, fmt.Errorf("section %d config: %w", i, err)
		}
		configs[i] = config
	}

	for i, section := range sections {
		if meta.Title == "" {
			meta.Title = stripHTML(section.Heading)
		}
		if meta.Desc == "" {
			meta.Desc = firstNonEmpty(stripHTML(section.Subheading), pageSectionConfigDescription(section.SectionType, configs[i]))
		}
		if meta.Desc == "" {
			for _, item := range section.Items {
				if meta.Desc = firstNonEmpty(stripHTML(item.Subheading), stripHTML(item.Heading)); meta.Desc != "" {
					break
				}
			}
		}
	}

	// A hero background is composed as the page's lead visual and is the best
	// social preview. Galleries and other explicitly media-led blocks follow.
	meta.Image = firstSectionConfigImage(sections, configs, "hero", "background_image")
	if meta.Image == "" {
		meta.Image = firstSectionItemImage(sections, "image_gallery")
	}
	if meta.Image == "" {
		meta.Image = firstSectionItemImage(sections, "event_highlights")
	}
	if meta.Image == "" {
		meta.Image = firstRichTextMediaImage(sections, configs)
	}
	if meta.Image == "" {
		meta.Image = firstSectionConfigImage(sections, configs, "profile_card", "banner_url", "avatar_url")
	}
	if meta.Image == "" {
		meta.Image = firstSectionItemImage(sections, "")
	}

	meta.Desc = snip(meta.Desc, 160)
	return meta, nil
}

func decodePageSectionConfig(raw json.RawMessage) (any, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return map[string]any{}, nil
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if encoded, ok := value.(string); ok {
		if strings.TrimSpace(encoded) == "" {
			return map[string]any{}, nil
		}
		if err := json.Unmarshal([]byte(encoded), &value); err != nil {
			return nil, err
		}
	}
	return value, nil
}

func pageSectionConfigDescription(sectionType string, config any) string {
	values, _ := config.(map[string]any)
	if values == nil {
		return ""
	}
	keys := []string{"description"}
	if sectionType == "rich_text" {
		keys = []string{"content", "description"}
	} else if sectionType == "profile_card" {
		keys = []string{"description", "profile_subtitle"}
	}
	for _, key := range keys {
		if value, ok := values[key].(string); ok {
			if text := stripHTML(value); text != "" {
				return text
			}
		}
	}
	return ""
}

func firstSectionConfigImage(sections []pageSEOSection, configs []any, sectionType string, keys ...string) string {
	for i, section := range sections {
		if section.SectionType != sectionType {
			continue
		}
		values, _ := configs[i].(map[string]any)
		for _, key := range keys {
			if img := imageString(values[key]); img != "" {
				return img
			}
		}
	}
	return ""
}

func firstRichTextMediaImage(sections []pageSEOSection, configs []any) string {
	for i, section := range sections {
		if section.SectionType != "rich_text" {
			continue
		}
		values, _ := configs[i].(map[string]any)
		content, _ := values["content"].(string)
		if img := firstNonEmpty(firstImageFromHTML(content), firstYouTubeThumbnailFromText(content)); img != "" {
			return img
		}
	}
	return ""
}

func firstSectionItemImage(sections []pageSEOSection, sectionType string) string {
	for _, section := range sections {
		if sectionType != "" && section.SectionType != sectionType {
			continue
		}
		for _, item := range section.Items {
			if img := imageString(item.ImageURL); img != "" {
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
