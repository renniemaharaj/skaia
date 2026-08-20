package seo

import (
	"database/sql"
	"encoding/xml"
	"os"
	"strings"
	"time"

	"github.com/skaia/backend/database"
)

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
	Loc        string `xml:"loc"`
	LastMod    string `xml:"lastmod,omitempty"`
	ChangeFreq string `xml:"changefreq,omitempty"`
	Priority   string `xml:"priority,omitempty"`
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

func BuildSitemapXML() string {
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
		return nil
	}
	defer rows.Close()

	entries := make([]SitemapEntry, 0)

	for rows.Next() {
		var entry SitemapEntry

		if err := rows.Scan(&entry.Path, &entry.LastMod); err != nil {
			continue
		}

		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil
	}

	return entries
}
