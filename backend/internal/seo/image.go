package seo

import (
	"mime"
	"path/filepath"
	"strings"
)

type ImageMeta struct {
	Width  int    `json:"width,omitempty"`
	Height int    `json:"height,omitempty"`
	MIME   string `json:"mime,omitempty"`
}

// imageMetaFromReference is intentionally side-effect free. Image dimensions
// belong to upload-time metadata; SSR must never make outbound requests based
// on user-controlled page, forum, product, or profile content.
func imageMetaFromReference(raw string) ImageMeta {
	return ImageMeta{MIME: mimeFromURL(raw)}
}

func mimeFromURL(raw string) string {
	ext := strings.ToLower(filepath.Ext(strings.Split(raw, "?")[0]))

	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		if mt := mime.TypeByExtension(ext); mt != "" {
			return strings.Split(mt, ";")[0]
		}
		return ""
	}
}
