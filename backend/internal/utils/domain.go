package utils

import (
	"os"
	"strconv"
	"strings"
)

// GetFrappeDomain returns the configured base domain for Frappe sites.
// A site named "site14" should resolve to site14.localhost locally and
// site14.example.com in production.
func GetFrappeDomain() string {
	domains := os.Getenv("DOMAINS")
	if domains == "" {
		return "localhost"
	}

	fields := strings.Fields(domains)
	if len(fields) == 0 {
		return "localhost"
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

	return domain
}

func GetFrappeSiteName(instanceID int64) string {
	return "site" + strconv.FormatInt(instanceID, 10) + "." + GetFrappeDomain()
}
