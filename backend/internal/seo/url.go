package seo

import (
	"net/http"
	"os"
	"strings"
)

func publicBaseURL(r *http.Request) string {
	if v := strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/"); v != "" {
		return v
	}

	scheme := "https"
	if r.TLS == nil {
		if xf := r.Header.Get("X-Forwarded-Proto"); xf != "" {
			scheme = xf
		}
	}

	host := r.Host
	if xh := r.Header.Get("X-Forwarded-Host"); xh != "" {
		host = xh
	}

	return scheme + "://" + host
}

func absoluteURL(r *http.Request, value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		return value
	}

	if strings.HasPrefix(value, "//") {
		return "https:" + value
	}

	if strings.HasPrefix(value, "/") {
		return publicBaseURL(r) + value
	}

	return publicBaseURL(r) + "/" + value
}
