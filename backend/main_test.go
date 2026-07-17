package main

import (
	"net/http"
	"net/http/httptest"
	"os"
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
	if !strings.Contains(xml, "<loc>https://example.com/login</loc>") {
		t.Fatalf("expected login URL in sitemap, got %s", xml)
	}
	if !strings.Contains(xml, "<urlset") {
		t.Fatalf("expected urlset root in sitemap, got %s", xml)
	}
}

func TestGetSitemapBaseURL(t *testing.T) {
	orig := os.Getenv("SITEMAP_BASE_URL")
	defer os.Setenv("SITEMAP_BASE_URL", orig)

	os.Setenv("SITEMAP_BASE_URL", "https://sitemap.example.org")
	if got := getSitemapBaseURL(); got != "https://sitemap.example.org" {
		t.Fatalf("expected %q got %q", "https://sitemap.example.org", got)
	}

	os.Unsetenv("SITEMAP_BASE_URL")
	os.Setenv("DOMAINS", "example.com www.example.com")
	if got := getSitemapBaseURL(); got != "https://example.com" {
		t.Fatalf("expected %q got %q", "https://example.com", got)
	}

	os.Unsetenv("DOMAINS")
	if got := getSitemapBaseURL(); got != "http://localhost:8080" {
		t.Fatalf("expected fallback %q got %q", "http://localhost:8080", got)
	}
}
