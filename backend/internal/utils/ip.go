package utils

import (
	"net"
	"net/http"
	"strings"
)

// RealIP extracts the true client IP from an HTTP request.
//
// Resolution order (first non-empty value wins):
//  1. CF-Connecting-IP  — set by Cloudflare; authoritative when running behind CF.
//  2. X-Forwarded-For   — first (leftmost) element is the original client.
//  3. X-Real-IP         — set by nginx and some load balancers.
//  4. RemoteAddr        — raw TCP peer address, port stripped.
//
// All callers in the codebase should use this function rather than
// implementing their own IP extraction.
func RealIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return strings.TrimSpace(ip)
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take only the first (leftmost) address — that is the original client.
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
