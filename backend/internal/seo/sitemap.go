package seo

import (
	"context"
	"database/sql"
	"encoding/xml"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/internal/seocache"
	log "github.com/skaia/backend/internal/syslog"
)

const sitemapCacheTTL = 15 * time.Minute

var sitemapPaths = []string{
	"/",
	"/store",
	"/forum",
	"/doc",
	"/kjv",
	"/pages",
	"/privacy",
	"/tos",
}

type SitemapEntry struct {
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

func BuildSitemapXML(ctx context.Context, rdb *redis.Client) string {
	cacheKey := seocache.RouteKey("/sitemap.xml")

	if rdb != nil {
		cached, err := rdb.Get(ctx, cacheKey).Result()
		switch {
		case err == nil:
			return cached
		case err != redis.Nil:
			log.Printf("seo: read sitemap route cache: %v", err)
		}
	}

	xmlContent := buildSitemapXML()

	if xmlContent != "" && rdb != nil {
		if err := rdb.Set(ctx, cacheKey, xmlContent, sitemapCacheTTL).Err(); err != nil {
			log.Printf("seo: write sitemap route cache: %v", err)
		}
	}

	return xmlContent
}

func buildSitemapXML() string {
	baseURL := getSitemapBaseURL()

	entries := make([]SitemapEntry, 0, len(sitemapPaths))

	for _, path := range sitemapPaths {
		entries = append(entries, SitemapEntry{
			Path: path,
		})
	}

	entries = append(entries, contentSitemapEntries(database.DB)...)

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

func contentSitemapEntries(db *sql.DB) []SitemapEntry {
	if db == nil {
		return nil
	}

	rows, err := db.Query(`
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
		log.Printf("seo: query sitemap content: %v", err)
		return nil
	}
	defer rows.Close()

	entries := make([]SitemapEntry, 0)

	for rows.Next() {
		var entry SitemapEntry

		if err := rows.Scan(&entry.Path, &entry.LastMod); err != nil {
			log.Printf("seo: scan sitemap content: %v", err)
			continue
		}

		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		log.Printf("seo: iterate sitemap content: %v", err)
		return nil
	}

	return entries
}
