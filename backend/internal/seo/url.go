package seo

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// ValidatePublicURLConfig rejects an explicitly unsafe or cross-tenant
// canonical origin. Missing PUBLIC_BASE_URL remains compatible with existing
// tenants because startup derives the same value from the first valid domain.
func ValidatePublicURLConfig() error {
	domains := configuredDomains()
	if len(domains) == 0 {
		return fmt.Errorf("DOMAINS must contain at least one valid hostname")
	}

	base := ConfiguredPublicBaseURL()
	if base == "" {
		return fmt.Errorf("could not derive PUBLIC_BASE_URL")
	}
	if raw := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")); raw != "" {
		if _, ok := normalizeBaseURL(raw, domains); !ok {
			return fmt.Errorf("PUBLIC_BASE_URL must be an approved HTTPS tenant origin")
		}
	}
	if sitemap := strings.TrimSpace(os.Getenv("SITEMAP_BASE_URL")); sitemap != "" &&
		strings.TrimRight(sitemap, "/") != base {
		return fmt.Errorf("SITEMAP_BASE_URL must match PUBLIC_BASE_URL")
	}
	return nil
}

// ConfiguredPublicBaseURL returns the deterministic public origin for this
// tenant. Production identity comes from PUBLIC_BASE_URL or the first approved
// DOMAINS entry, never from a request Host header.
func ConfiguredPublicBaseURL() string {
	domains := configuredDomains()

	if raw := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")); raw != "" {
		if base, ok := normalizeBaseURL(raw, domains); ok {
			return base
		}
	}

	if len(domains) > 0 {
		host := domains[0]
		scheme := "https"
		if isLocalHostname(hostnameOnly(host)) {
			scheme = "http"
		}
		return scheme + "://" + host
	}

	return ""
}

func publicBaseURL(r *http.Request) string {
	if configured := ConfiguredPublicBaseURL(); configured != "" {
		return configured
	}

	// DOMAINS is required by production startup. This fallback exists only for
	// isolated development/tests and deliberately ignores X-Forwarded-Host.
	host := strings.TrimSpace(r.Host)
	if host == "" {
		host = "localhost"
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	} else if forwarded := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))); forwarded == "http" || forwarded == "https" {
		scheme = forwarded
	}
	return scheme + "://" + host
}

func absoluteURL(r *http.Request, value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	baseRaw := publicBaseURL(r)
	base, err := url.Parse(baseRaw)
	if err != nil || base.Hostname() == "" {
		return ""
	}

	if strings.HasPrefix(value, "//") {
		value = "https:" + value
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}

	if parsed.IsAbs() {
		if parsed.User != nil || parsed.Scheme != "http" && parsed.Scheme != "https" {
			return ""
		}
		if approvedTenantHost(parsed.Hostname()) {
			parsed.Scheme = base.Scheme
			parsed.Host = base.Host
			return parsed.String()
		}
		// Do not emit insecure third-party social images.
		if parsed.Scheme != "https" {
			return ""
		}
		return parsed.String()
	}

	if parsed.Host != "" {
		return ""
	}
	if !strings.HasPrefix(parsed.Path, "/") {
		parsed.Path = "/" + parsed.Path
	}
	parsed.Scheme = base.Scheme
	parsed.Host = base.Host
	return parsed.String()
}

func configuredDomains() []string {
	var domains []string
	seen := map[string]bool{}
	for _, field := range strings.Fields(os.Getenv("DOMAINS")) {
		host := normalizeDomain(field)
		if host == "" || seen[host] {
			continue
		}
		seen[host] = true
		domains = append(domains, host)
	}
	return domains
}

func normalizeBaseURL(raw string, domains []string) (string, bool) {
	parsed, err := url.Parse(strings.TrimRight(raw, "/"))
	if err != nil || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Hostname() == "" {
		return "", false
	}
	if parsed.Path != "" {
		return "", false
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && isLocalHostname(parsed.Hostname())) {
		return "", false
	}
	if len(domains) > 0 && !hostInDomains(parsed.Hostname(), domains) {
		return "", false
	}
	return parsed.Scheme + "://" + parsed.Host, true
}

func normalizeDomain(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" || strings.HasPrefix(raw, "*.") {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || parsed.Hostname() == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return ""
	}
	return parsed.Host
}

func approvedTenantHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if base := ConfiguredPublicBaseURL(); base != "" {
		if parsed, err := url.Parse(base); err == nil && strings.EqualFold(parsed.Hostname(), host) {
			return true
		}
	}
	return hostInDomains(host, configuredDomains())
}

func hostInDomains(host string, domains []string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	for _, domain := range domains {
		candidate := strings.ToLower(strings.TrimSuffix(hostnameOnly(domain), "."))
		if host == candidate || host == "www."+candidate {
			return true
		}
	}
	return false
}

func hostnameOnly(hostport string) string {
	if host, _, err := net.SplitHostPort(hostport); err == nil {
		return host
	}
	return strings.Trim(hostport, "[]")
}

func isLocalHostname(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "localhost" || net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback()
}
