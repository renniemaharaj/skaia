package seo

import (
	"context"
	"database/sql"
	"encoding/xml"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/internal/seocache"
	log "github.com/skaia/backend/internal/syslog"
)

const sitemapCacheTTL = 15 * time.Minute

var sitemapPaths = []string{
	"/",
	"/store",
	"/forum",
	"/forum/docs",
	"/doc",
	"/kjv",
	"/pages",
	"/privacy",
	"/tos",
}

type sitemapEntry struct {
	Path    string
	LastMod sql.NullTime
}

type sitemapURL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

type sitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	Xmlns   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

func getSitemapBaseURL() string {
	if base := ConfiguredPublicBaseURL(); base != "" {
		return strings.TrimRight(base, "/")
	}

	if v := os.Getenv("SITEMAP_BASE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}

	return "http://localhost:8080"
}

// NewSitemapHandler serves the canonical and legacy tenant-named sitemap
// routes. Generation, tenant validation, and caching remain owned together.
func NewSitemapHandler(db *sql.DB, rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		client := chi.URLParam(r, "client")
		configuredClient := os.Getenv("CLIENT_NAME")
		if client != "" && configuredClient != "" && client != configuredClient {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(buildCachedSitemapXML(r.Context(), db, rdb)))
	}
}

func buildCachedSitemapXML(ctx context.Context, db *sql.DB, rdb *redis.Client) string {
	cacheKey := seocache.RouteKey("/sitemap.xml")

	if rdb != nil {
		cached, err := rdb.Get(ctx, cacheKey).Result()
		switch {
		case err == nil && cached != "":
			return cached
		case err != redis.Nil:
			log.Printf("seo: read sitemap route cache: %v", err)
		}
	}

	xmlContent, contentErr := buildSitemapXML(ctx, db)
	if contentErr != nil {
		// A static-only sitemap is still useful, but must not be persisted for
		// the full TTL after a transient database failure.
		log.Printf("seo: build dynamic sitemap content: %v", contentErr)
	}

	if xmlContent != "" && contentErr == nil && rdb != nil {
		if err := rdb.Set(ctx, cacheKey, xmlContent, sitemapCacheTTL).Err(); err != nil {
			log.Printf("seo: write sitemap route cache: %v", err)
		}
	}

	return xmlContent
}

func buildSitemapXML(ctx context.Context, db *sql.DB) (string, error) {
	baseURL := getSitemapBaseURL()

	entries := make([]sitemapEntry, 0, len(sitemapPaths))

	for _, path := range sitemapPaths {
		entries = append(entries, sitemapEntry{
			Path: path,
		})
	}

	dynamicEntries, contentErr := contentSitemapEntries(ctx, db)
	entries = append(entries, dynamicEntries...)

	return marshalSitemapXML(baseURL, entries), contentErr
}

func marshalSitemapXML(baseURL string, entries []sitemapEntry) string {
	urls := make([]sitemapURL, 0, len(entries))

	for _, entry := range entries {
		item := sitemapURL{
			Loc: baseURL + entry.Path,
		}

		if entry.LastMod.Valid {
			item.LastMod = entry.LastMod.Time.UTC().Format(time.RFC3339)
		}

		urls = append(urls, item)
	}

	data, err := xml.MarshalIndent(sitemapURLSet{
		Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
		URLs:  urls,
	}, "", "  ")
	if err != nil {
		log.Printf("seo: marshal sitemap: %v", err)
		return ""
	}

	return xml.Header + string(data) + "\n"
}

func contentSitemapEntries(ctx context.Context, db *sql.DB) ([]sitemapEntry, error) {
	if db == nil {
		return nil, nil
	}

	rows, err := db.QueryContext(ctx, `
		SELECT path, updated_at
		FROM (
			SELECT
				'/page/' || p.slug AS path,
				p.updated_at
			FROM pages p
			WHERE p.visibility = 'public'
			  AND p.deleted_at IS NULL
			  AND p.slug NOT IN ('privacy', 'tos')

			UNION ALL

			SELECT
				'/doc/' || d.slug AS path,
				d.updated_at
			FROM documentations d
			WHERE d.visibility = 'public'
			  AND d.deleted_at IS NULL

			UNION ALL

			SELECT
				'/doc/' || d.slug || '/' || a.slug AS path,
				a.updated_at
			FROM documentation_articles a
			JOIN documentations d
			  ON d.id = a.documentation_id
			WHERE d.visibility = 'public'
			  AND d.deleted_at IS NULL
			  AND a.deleted_at IS NULL

			UNION ALL

			SELECT
				'/view-thread/' || t.id AS path,
				t.updated_at
			FROM forum_threads t
			WHERE t.deleted_at IS NULL

			UNION ALL

			SELECT
				'/store/product/' || p.id AS path,
				p.updated_at
			FROM products p
			WHERE p.is_active = true
			  AND p.deleted_at IS NULL
		) content
		ORDER BY path
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]sitemapEntry, 0)

	for rows.Next() {
		var entry sitemapEntry

		if err := rows.Scan(&entry.Path, &entry.LastMod); err != nil {
			return nil, err
		}

		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return entries, nil
}
