package seo

import (
	"context"
	"database/sql"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestBuildSitemapXMLIncludesIndexableStaticRoutes(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")

	got, err := buildSitemapXML(context.Background(), nil)
	if err != nil {
		t.Fatalf("buildSitemapXML() error = %v", err)
	}

	for _, route := range []string{"/", "/forum", "/forum/docs", "/doc"} {
		if !strings.Contains(got, "<loc>https://example.com"+route+"</loc>") {
			t.Errorf("sitemap missing static route %q: %s", route, got)
		}
	}
	for _, route := range []string{"/login", "/inbox", "/users", "/doc/new"} {
		if strings.Contains(got, route+"</loc>") {
			t.Errorf("sitemap contains non-indexable route %q: %s", route, got)
		}
	}
}

func TestSitemapHandlerValidatesNamedTenantAndContentType(t *testing.T) {
	t.Setenv("CLIENT_NAME", "writer")
	t.Setenv("DOMAINS", "example.com")

	router := chi.NewRouter()
	router.Get("/sitemap/{client}.xml", NewSitemapHandler(nil, nil))

	valid := httptest.NewRecorder()
	router.ServeHTTP(valid, httptest.NewRequest(http.MethodGet, "/sitemap/writer.xml", nil))
	if valid.Code != http.StatusOK {
		t.Fatalf("matching tenant status = %d, want 200", valid.Code)
	}
	if got := valid.Header().Get("Content-Type"); got != "application/xml; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}

	wrong := httptest.NewRecorder()
	router.ServeHTTP(wrong, httptest.NewRequest(http.MethodGet, "/sitemap/other.xml", nil))
	if wrong.Code != http.StatusNotFound {
		t.Fatalf("mismatched tenant status = %d, want 404", wrong.Code)
	}
}

func TestMarshalSitemapXMLEscapesLocationsAndFormatsLastMod(t *testing.T) {
	updated := time.Date(2026, time.August, 20, 12, 34, 56, 0, time.FixedZone("test", -4*60*60))
	got := marshalSitemapXML("https://example.com?a=1&b=2", []sitemapEntry{{
		Path:    "/doc/get-started",
		LastMod: sql.NullTime{Time: updated, Valid: true},
	}})

	if !strings.Contains(got, "<loc>https://example.com?a=1&amp;b=2/doc/get-started</loc>") {
		t.Fatalf("sitemap location was not XML escaped: %s", got)
	}
	if !strings.Contains(got, "<lastmod>2026-08-20T16:34:56Z</lastmod>") {
		t.Fatalf("sitemap lastmod was not normalized to UTC: %s", got)
	}

	var parsed sitemapURLSet
	if err := xml.Unmarshal([]byte(got), &parsed); err != nil {
		t.Fatalf("generated sitemap is invalid XML: %v", err)
	}
}

func TestGetSitemapBaseURL(t *testing.T) {
	t.Setenv("SITEMAP_BASE_URL", "https://sitemap.example.org")
	t.Setenv("DOMAINS", "example.com www.example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")
	if got := getSitemapBaseURL(); got != "https://example.com" {
		t.Fatalf("getSitemapBaseURL() = %q, want canonical public URL", got)
	}

	t.Setenv("DOMAINS", "")
	t.Setenv("PUBLIC_BASE_URL", "")
	if got := getSitemapBaseURL(); got != "https://sitemap.example.org" {
		t.Fatalf("getSitemapBaseURL() = %q, want configured sitemap URL", got)
	}

	t.Setenv("SITEMAP_BASE_URL", "")
	if got := getSitemapBaseURL(); got != "http://localhost:8080" {
		t.Fatalf("getSitemapBaseURL() = %q, want development fallback", got)
	}
}
