package seo

import (
	"net/http"
	"strings"
)

func serveInjected(w http.ResponseWriter, r *http.Request, data []byte, cached CachedMeta, status int) {
	out := string(data)
	meta := renderMeta(r, cached)

	out = replacePlaceholder(out, "%TITLE_PLACEHOLDER%", meta.TitleTag)
	out = replacePlaceholder(out, "%META_DESCRIPTION_PLACEHOLDER%", meta.DescTag)
	out = replacePlaceholder(out, "%FAVICON_PLACEHOLDER%", meta.FaviconTag)

	var tags strings.Builder
	for _, tag := range meta.Tags {
		tags.WriteString("  ")
		tags.WriteString(tag)
		tags.WriteByte('\n')
	}

	out = replacePlaceholder(out, "  %OG_IMAGE_PLACEHOLDER%", tags.String())

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	if cached.NoIndex || cached.NotFound {
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(out))
}
