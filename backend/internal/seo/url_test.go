package seo

import (
	"net/http/httptest"
	"testing"
)

func TestConfiguredPublicBaseURL(t *testing.T) {
	tests := []struct {
		name       string
		domains    string
		configured string
		want       string
	}{
		{name: "production fallback", domains: "example.com www.example.com", want: "https://example.com"},
		{name: "explicit approved", domains: "example.com", configured: "https://www.example.com", want: "https://www.example.com"},
		{name: "reject unapproved", domains: "example.com", configured: "https://evil.example", want: "https://example.com"},
		{name: "reject production http", domains: "example.com", configured: "http://example.com", want: "https://example.com"},
		{name: "local development", domains: "localhost:8080", want: "http://localhost:8080"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("DOMAINS", tt.domains)
			t.Setenv("PUBLIC_BASE_URL", tt.configured)
			if got := ConfiguredPublicBaseURL(); got != tt.want {
				t.Fatalf("ConfiguredPublicBaseURL() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidatePublicURLConfig(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")
	t.Setenv("SITEMAP_BASE_URL", "https://example.com")
	if err := ValidatePublicURLConfig(); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}

	t.Setenv("PUBLIC_BASE_URL", "https://evil.example")
	if err := ValidatePublicURLConfig(); err == nil {
		t.Fatal("cross-tenant PUBLIC_BASE_URL accepted")
	}
}

func TestAbsoluteURLRewritesOnlyApprovedTenantHosts(t *testing.T) {
	t.Setenv("DOMAINS", "example.com alias.example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")
	req := httptest.NewRequest("GET", "http://alias.example.com/", nil)

	tests := []struct {
		value string
		want  string
	}{
		{value: "/image.png", want: "https://example.com/image.png"},
		{value: "image.png", want: "https://example.com/image.png"},
		{value: "http://alias.example.com/image.png", want: "https://example.com/image.png"},
		{value: "https://cdn.example.net/image.png", want: "https://cdn.example.net/image.png"},
		{value: "http://cdn.example.net/image.png", want: ""},
		{value: "javascript:alert(1)", want: ""},
	}
	for _, tt := range tests {
		if got := absoluteURL(req, tt.value); got != tt.want {
			t.Errorf("absoluteURL(%q) = %q, want %q", tt.value, got, tt.want)
		}
	}
}
