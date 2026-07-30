package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCanonicalPublicBase(t *testing.T) {
	tests := []struct {
		name    string
		domains []string
		want    string
		wantErr bool
	}{
		{name: "production", domains: []string{"example.com", "alias.example.com"}, want: "https://example.com"},
		{name: "localhost", domains: []string{"localhost:1080"}, want: "http://localhost:1080"},
		{name: "scheme input", domains: []string{"https://example.com"}, want: "https://example.com"},
		{name: "wildcard primary rejected", domains: []string{"*.example.com"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := canonicalPublicBase(tt.domains)
			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("base = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateCanonicalEnv(t *testing.T) {
	valid := map[string]string{
		"DOMAINS":          "example.com alias.example.com",
		"PUBLIC_BASE_URL":  "https://example.com",
		"SITEMAP_BASE_URL": "https://example.com",
	}
	if err := validateCanonicalEnv(valid); err != nil {
		t.Fatalf("valid env rejected: %v", err)
	}

	for name, values := range map[string]map[string]string{
		"http production": {
			"DOMAINS": "example.com", "PUBLIC_BASE_URL": "http://example.com",
		},
		"foreign host": {
			"DOMAINS": "example.com", "PUBLIC_BASE_URL": "https://evil.example",
		},
		"mismatched sitemap": {
			"DOMAINS": "example.com", "PUBLIC_BASE_URL": "https://example.com",
			"SITEMAP_BASE_URL": "https://www.example.com",
		},
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateCanonicalEnv(values); err == nil {
				t.Fatal("invalid env accepted")
			}
		})
	}
}

func TestSyncCanonicalURLDefaultsMigratesExistingTenant(t *testing.T) {
	envFile := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(envFile, []byte("CLIENT_NAME=writer\nPORT=1080\nDOMAINS=thewriterco.com www.thewriterco.com\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := syncCanonicalURLDefaults(envFile); got != 2 {
		t.Fatalf("updated keys = %d, want 2", got)
	}
	data, err := os.ReadFile(envFile)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	for _, expected := range []string{
		"PUBLIC_BASE_URL=https://thewriterco.com",
		"SITEMAP_BASE_URL=https://thewriterco.com",
	} {
		if !strings.Contains(content, expected) {
			t.Fatalf("migrated env missing %q:\n%s", expected, content)
		}
	}
}
