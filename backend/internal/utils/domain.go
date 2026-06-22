package utils

import (
	"os"
	"strings"
)

// GetFrappeDomain returns the configured domain for Frappe sites
// derived from the backend's DOMAINS environment variable,
// or defaults to "frappe.localhost" if not set or if the domain is localhost.
func GetFrappeDomain() string {
	domains := os.Getenv("DOMAINS")
	if domains == "" {
		return "frappe.localhost"
	}

	fields := strings.Fields(domains)
	if len(fields) == 0 {
		return "frappe.localhost"
	}

	domain := fields[0]

	if strings.HasPrefix(domain, "http://") {
		domain = strings.TrimPrefix(domain, "http://")
	} else if strings.HasPrefix(domain, "https://") {
		domain = strings.TrimPrefix(domain, "https://")
	}

	// Strip port if present (e.g., from "localhost:8080" or "example.com:443")
	if idx := strings.Index(domain, ":"); idx != -1 {
		domain = domain[:idx]
	}

	if domain == "localhost" {
		return "frappe.localhost"
	}

	return domain
}
