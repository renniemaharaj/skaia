package ssr

import (
	"context"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

type ImageMeta struct {
	Width  int    `json:"width"`
	Height int    `json:"height"`
	MIME   string `json:"mime"`
}

func detectImageMeta(ctx context.Context, imgURL string) ImageMeta {
	m := ImageMeta{
		MIME: mimeFromURL(imgURL),
	}

	if imgURL == "" {
		return m
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imgURL, nil)
	if err != nil {
		return m
	}

	client := &http.Client{Timeout: 2 * time.Second}

	resp, err := client.Do(req)
	if err != nil {
		return m
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return m
	}

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		if clean := strings.Split(ct, ";")[0]; clean != "" {
			m.MIME = strings.TrimSpace(clean)
		}
	}

	limited := io.LimitReader(resp.Body, 512*1024)

	cfg, format, err := image.DecodeConfig(limited)
	if err != nil {
		return m
	}

	m.Width = cfg.Width
	m.Height = cfg.Height

	switch format {
	case "jpeg":
		m.MIME = "image/jpeg"
	case "png":
		m.MIME = "image/png"
	case "gif":
		m.MIME = "image/gif"
	}

	return m
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
