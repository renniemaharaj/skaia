package ssr

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"

	icfg "github.com/skaia/backend/internal/config"
	"github.com/skaia/backend/models"
)

// IndexHandler returns an http.HandlerFunc that serves the SPA index file
// with server-injected SEO/head tags based on the site config.
func IndexHandler(cfgSvc *icfg.Service) http.HandlerFunc {
	// determine the file to serve. during development we can override
	// via INDEX_FILE_PATH env var, but in production the build lives under
	// /app/frontend/dist as created by our Docker build step.
	indexPath := os.Getenv("INDEX_FILE_PATH")
	if indexPath == "" {
		indexPath = "frontend/dist/index.html"
	}

	return func(w http.ResponseWriter, r *http.Request) {
		data, err := ioutil.ReadFile(indexPath)
		if err != nil {
			log.Printf("ssr: failed to read index file %s: %v", indexPath, err)
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		// load branding and seo from site_config
		var branding models.Branding
		var seo models.SEO

		if sc, err := cfgSvc.GetConfig("branding"); err == nil && sc != nil {
			_ = json.Unmarshal([]byte(sc.Value), &branding)
		}
		if sc, err := cfgSvc.GetConfig("seo"); err == nil && sc != nil {
			_ = json.Unmarshal([]byte(sc.Value), &seo)
		}

		// Build SSR title from branding (the source of truth for site identity).
		// SiteHead.tsx can further override client-side via react-helmet if
		// the user sets a custom SEO title in the admin panel.
		title := branding.SiteName
		if branding.Tagline != "" && title != "" {
			title += " – " + branding.Tagline
		}
		titleTag := ""
		if title != "" {
			titleTag = "<title>" + htmlEscape(title) + "</title>"
		}

		// Description from branding tagline; SEO description used only by
		// SiteHead client-side if the user fills it in.
		descTag := ""
		if branding.Tagline != "" {
			descTag = "<meta name=\"description\" content=\"" + htmlEscape(branding.Tagline) + "\">"
		}

		ogTag := ""
		if seo.OGImage != "" {
			ogTag = "<meta property=\"og:image\" content=\"" + htmlEscape(seo.OGImage) + "\">"
		} else if branding.LogoURL != "" {
			ogTag = "<meta property=\"og:image\" content=\"" + htmlEscape(branding.LogoURL) + "\">"
		}

		faviconTag := ""
		if branding.FaviconURL != "" {
			faviconTag = "<link rel=\"icon\" href=\"" + htmlEscape(branding.FaviconURL) + "\">"
		}

		out := string(data)
		out = replacePlaceholder(out, "%TITLE_PLACEHOLDER%", titleTag)
		out = replacePlaceholder(out, "%META_DESCRIPTION_PLACEHOLDER%", descTag)
		out = replacePlaceholder(out, "%OG_IMAGE_PLACEHOLDER%", ogTag)
		out = replacePlaceholder(out, "%FAVICON_PLACEHOLDER%", faviconTag)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Write([]byte(out))
	}
}

func replacePlaceholder(doc, placeholder, replacement string) string {
	return strings.ReplaceAll(doc, placeholder, replacement)
}

func htmlEscape(s string) string {
	// minimal escaping for quotes and ampersand
	b, _ := json.Marshal(s)
	// json.Marshal wraps the string in quotes; strip them
	if len(b) >= 2 && b[0] == '"' && b[len(b)-1] == '"' {
		return string(b[1 : len(b)-1])
	}
	return s
}
