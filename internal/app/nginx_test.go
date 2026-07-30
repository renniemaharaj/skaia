package app

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestNginxHostsForDomainAddsWildcardForApexDomains(t *testing.T) {
	tests := []struct {
		name   string
		domain string
		want   []string
	}{
		{
			name:   "apex domain",
			domain: "thewriterco.com",
			want:   []string{"thewriterco.com", `~^site[0-9]+\.thewriterco\.com$`},
		},
		{
			name:   "www domain",
			domain: "www.thewriterco.com",
			want:   []string{"www.thewriterco.com"},
		},
		{
			name:   "localhost",
			domain: "localhost",
			want:   []string{"localhost"},
		},
		{
			name:   "ip address",
			domain: "127.0.0.1",
			want:   []string{"127.0.0.1"},
		},
		{
			name:   "already wildcard",
			domain: "*.thewriterco.com",
			want:   []string{"thewriterco.com", `~^site[0-9]+\.thewriterco\.com$`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nginxHostsForDomain(tt.domain)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("nginxHostsForDomain(%q) = %#v, want %#v", tt.domain, got, tt.want)
			}
		})
	}
}

func TestExpandDomainsNormalizesConfiguredOrigins(t *testing.T) {
	got := expandDomains([]string{"https://example.com", "*.legacy.example"})
	want := []string{"example.com", "www.example.com", "legacy.example", "www.legacy.example"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expandDomains() = %#v, want %#v", got, want)
	}
}

func TestNginxDefaultServerIsTenantIndependent(t *testing.T) {
	block := nginxDefaultServerBlock()
	for _, expected := range []string{"listen 80 default_server", "location = /healthz", `return 200 "ok\n"`, "return 444"} {
		if !strings.Contains(block, expected) {
			t.Fatalf("default server missing %q:\n%s", expected, block)
		}
	}
	if strings.Contains(block, "proxy_pass") {
		t.Fatalf("default server must not enter a tenant backend:\n%s", block)
	}
	if strings.Contains(nginxUnknownBackendMap, "-backend") {
		t.Fatalf("unknown host map selects a tenant: %s", nginxUnknownBackendMap)
	}
}

func TestTenantHealthLocationNeverProxiesToSSR(t *testing.T) {
	location := nginxHealthLocation()
	if !strings.Contains(location, `return 200 "ok\n"`) || strings.Contains(location, "proxy_pass") {
		t.Fatalf("unsafe tenant health location:\n%s", location)
	}
}

func TestSharedHealthcheckUsesDedicatedEndpoint(t *testing.T) {
	data, err := os.ReadFile("../../compose.yml")
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	if !strings.Contains(content, "http://localhost:80/healthz") {
		t.Fatalf("compose healthcheck does not use /healthz")
	}
	if strings.Contains(content, `"http://localhost:80",`) {
		t.Fatalf("compose healthcheck still warms tenant root")
	}
}

func TestGenerateNginxConfigKeepsTenantRoutingIsolated(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GRENGO_ROOT", root)

	for name, env := range map[string]string{
		"writer": "CLIENT_NAME=writer\nPORT=1080\nDOMAINS=thewriterco.com\n",
		"skaia":  "CLIENT_NAME=skaia\nPORT=1081\nDOMAINS=skaiacraft.com\n",
	} {
		dir := filepath.Join(root, "backends", name)
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(env), 0600); err != nil {
			t.Fatal(err)
		}
	}
	indexDir := filepath.Join(root, "backend", "frontend", "dist")
	if err := os.MkdirAll(indexDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(indexDir, "index.html"), []byte("<html><head>%TITLE_PLACEHOLDER%</head></html>"), 0600); err != nil {
		t.Fatal(err)
	}

	generateNginxConfig()
	data, err := os.ReadFile(filepath.Join(root, "nginx", "default.conf"))
	if err != nil {
		t.Fatal(err)
	}
	config := string(data)

	for _, expected := range []string{
		"thewriterco.com",
		`~^site[0-9]+\.thewriterco\.com$`,
		"skaiacraft.com",
		`~^site[0-9]+\.skaiacraft\.com$`,
		nginxUnknownBackendMap,
		"listen 80 default_server",
		"location = /healthz",
	} {
		if !strings.Contains(config, expected) {
			t.Errorf("generated config missing %q", expected)
		}
	}
	if strings.Contains(config, "default                 writer-backend") ||
		strings.Contains(config, "default                 skaia-backend") {
		t.Fatalf("unknown host still falls through to a tenant:\n%s", config)
	}
}
