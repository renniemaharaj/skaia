package ssr

import (
	"net/http"
	"strings"
)

func serveInjected(w http.ResponseWriter, data []byte, meta CachedMeta) {
	out := string(data)

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
	_, _ = w.Write([]byte(out))
}
