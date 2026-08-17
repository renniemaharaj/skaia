package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/cors"
)

func TestCORSAllowsInteractiveModerationPatch(t *testing.T) {
	handler := cors.Handler(apiCORSOptions([]string{"https://client.example"}))(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodOptions, "/api/pages/1/sections/2/responses/3", nil)
	req.Header.Set("Origin", "https://client.example")
	req.Header.Set("Access-Control-Request-Method", http.MethodPatch)
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("PATCH preflight was rejected with %d", response.Code)
	}
	if got := response.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, http.MethodPatch) {
		t.Fatalf("PATCH missing from allowed methods: %q", got)
	}
}

func TestBuildSitemapXML(t *testing.T) {
	xml := buildSitemapXML("https://example.com")
	if !strings.Contains(xml, "<loc>https://example.com/</loc>") {
		t.Fatalf("expected root URL in sitemap, got %s", xml)
	}
	if !strings.Contains(xml, "<loc>https://example.com/forum</loc>") {
		t.Fatalf("expected forum URL in sitemap, got %s", xml)
	}
	if strings.Contains(xml, "/login</loc>") || strings.Contains(xml, "/inbox</loc>") {
		t.Fatalf("sitemap contains non-indexable routes: %s", xml)
	}
	if !strings.Contains(xml, "<urlset") {
		t.Fatalf("expected urlset root in sitemap, got %s", xml)
	}
}

func TestBuildSitemapXMLIncludesDynamicPathsAndEscapesLocations(t *testing.T) {
	xml := buildSitemapXMLWithPaths("https://example.com?a=1&b=2", []string{"/doc/product/start"})
	if !strings.Contains(xml, "<loc>https://example.com?a=1&amp;b=2/doc/product/start</loc>") {
		t.Fatalf("expected escaped dynamic documentation URL, got %s", xml)
	}
}

func TestGetSitemapBaseURL(t *testing.T) {
	t.Setenv("SITEMAP_BASE_URL", "https://sitemap.example.org")
	t.Setenv("DOMAINS", "example.com www.example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")
	if got := getSitemapBaseURL(); got != "https://example.com" {
		t.Fatalf("expected %q got %q", "https://example.com", got)
	}

	t.Setenv("DOMAINS", "")
	t.Setenv("PUBLIC_BASE_URL", "")
	if got := getSitemapBaseURL(); got != "https://sitemap.example.org" {
		t.Fatalf("expected %q got %q", "https://sitemap.example.org", got)
	}

	t.Setenv("SITEMAP_BASE_URL", "")
	if got := getSitemapBaseURL(); got != "http://localhost:8080" {
		t.Fatalf("expected fallback %q got %q", "http://localhost:8080", got)
	}
}

func TestPublicRequestSchemeUsesCanonicalOrigin(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")
	req := httptest.NewRequest(http.MethodGet, "http://example.com/instances/1", nil)
	req.Header.Set("X-Forwarded-Proto", "http")
	if got := publicRequestScheme(req); got != "https" {
		t.Fatalf("publicRequestScheme() = %q, want https", got)
	}
}
