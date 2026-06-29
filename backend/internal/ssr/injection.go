package ssr

import "net/http"

func serveInjected(w http.ResponseWriter, data []byte, meta CachedMeta) {
	out := string(data)
	out = replacePlaceholder(out, "%TITLE_PLACEHOLDER%", meta.TitleTag)
	out = replacePlaceholder(out, "%META_DESCRIPTION_PLACEHOLDER%", meta.DescTag)
	ogTags := ""
	for _, ogTag := range meta.OGTags {
		ogTags += "  " + ogTag + "\n"
	}
	out = replacePlaceholder(out, "  %OG_IMAGE_PLACEHOLDER%", ogTags)
	out = replacePlaceholder(out, "%FAVICON_PLACEHOLDER%", meta.FaviconTag)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Write([]byte(out))
}
