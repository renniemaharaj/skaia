package app

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

func canonicalPublicBase(domains []string) (string, error) {
	if len(domains) == 0 {
		return "", fmt.Errorf("DOMAINS must contain at least one hostname")
	}
	host, err := normalizedDomainHost(domains[0])
	if err != nil {
		return "", err
	}
	scheme := "https"
	if isLocalDomain(host) {
		scheme = "http"
	}
	return scheme + "://" + host, nil
}

func validateCanonicalEnv(values map[string]string) error {
	domains := strings.Fields(values["DOMAINS"])
	if len(domains) == 0 {
		return fmt.Errorf("DOMAINS must contain at least one hostname")
	}

	publicBase := strings.TrimSpace(values["PUBLIC_BASE_URL"])
	if publicBase == "" {
		return fmt.Errorf("PUBLIC_BASE_URL is required")
	}
	publicURL, err := url.Parse(strings.TrimRight(publicBase, "/"))
	if err != nil || publicURL.Hostname() == "" || publicURL.User != nil ||
		publicURL.Path != "" || publicURL.RawQuery != "" || publicURL.Fragment != "" {
		return fmt.Errorf("PUBLIC_BASE_URL must be an absolute origin without a path")
	}
	if publicURL.Scheme != "https" && !(publicURL.Scheme == "http" && isLocalDomain(publicURL.Hostname())) {
		return fmt.Errorf("PUBLIC_BASE_URL must use https outside local development")
	}

	approved := false
	for _, domain := range domains {
		host, normalizeErr := normalizedDomainHost(domain)
		if normalizeErr != nil {
			return normalizeErr
		}
		if strings.EqualFold(publicURL.Hostname(), hostnameOnly(host)) ||
			strings.EqualFold(publicURL.Hostname(), "www."+hostnameOnly(host)) {
			approved = true
			break
		}
	}
	if !approved {
		return fmt.Errorf("PUBLIC_BASE_URL hostname must be listed in DOMAINS")
	}

	sitemap := strings.TrimSpace(values["SITEMAP_BASE_URL"])
	if sitemap == "" {
		return fmt.Errorf("SITEMAP_BASE_URL is required")
	}
	if strings.TrimRight(sitemap, "/") != strings.TrimRight(publicBase, "/") {
		return fmt.Errorf("SITEMAP_BASE_URL must match PUBLIC_BASE_URL")
	}
	return nil
}

func syncCanonicalURLDefaults(envFile string) int {
	values := loadEnvMap(envFile)
	base, err := canonicalPublicBase(strings.Fields(values["DOMAINS"]))
	if err != nil {
		warn("Cannot derive canonical public URL for %s: %v", envFile, err)
		return 0
	}

	updated := 0
	for _, key := range []string{"PUBLIC_BASE_URL", "SITEMAP_BASE_URL"} {
		if strings.TrimSpace(values[key]) != "" {
			continue
		}
		if err := setEnvVal(envFile, key, base); err != nil {
			warn("Cannot set %s in %s: %v", key, envFile, err)
			return updated
		}
		updated++
	}
	if err := validateCanonicalEnv(loadEnvMap(envFile)); err != nil {
		warn("Invalid canonical URL configuration in %s: %v", envFile, err)
	}
	return updated
}

func parseEnvContent(content string) map[string]string {
	values := map[string]string{}
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if key, value, ok := strings.Cut(line, "="); ok {
			values[strings.TrimSpace(key)] = strings.TrimSpace(value)
		}
	}
	return values
}

func normalizedDomainHost(raw string) (string, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" || strings.HasPrefix(raw, "*.") {
		return "", fmt.Errorf("invalid primary domain %q", raw)
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" || parsed.User != nil ||
		parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("invalid domain %q", raw)
	}
	return parsed.Host, nil
}

func hostnameOnly(hostport string) string {
	if host, _, err := net.SplitHostPort(hostport); err == nil {
		return host
	}
	return strings.Trim(hostport, "[]")
}

func isLocalDomain(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(hostnameOnly(host), "."))
	ip := net.ParseIP(host)
	return host == "localhost" || ip != nil && ip.IsLoopback()
}

func validateSiteEnvContent(content string) error {
	values := parseEnvContent(content)
	if values["CLIENT_NAME"] == "" || values["PORT"] == "" {
		return fmt.Errorf("content missing required CLIENT_NAME= or PORT= declarations")
	}
	return validateCanonicalEnv(values)
}
