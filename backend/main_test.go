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

func TestPublicRequestSchemeUsesCanonicalOrigin(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")
	req := httptest.NewRequest(http.MethodGet, "http://example.com/instances/1", nil)
	req.Header.Set("X-Forwarded-Proto", "http")
	if got := publicRequestScheme(req); got != "https" {
		t.Fatalf("publicRequestScheme() = %q, want https", got)
	}
}
