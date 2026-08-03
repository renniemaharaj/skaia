package seo

import (
	"net/http"
	"strconv"
)

const cachedMetaVersion = 3

// CachedMeta contains semantic, origin-independent metadata. Absolute URLs and
// escaped HTML are produced only while serving a specific request.
type CachedMeta struct {
	Version     int       `json:"version"`
	Title       string    `json:"title,omitempty"`
	Description string    `json:"description,omitempty"`
	Image       string    `json:"image,omitempty"`
	ImageAlt    string    `json:"image_alt,omitempty"`
	Favicon     string    `json:"favicon,omitempty"`
	SiteName    string    `json:"site_name,omitempty"`
	ImageMeta   ImageMeta `json:"image_meta,omitempty"`
	NotFound    bool      `json:"not_found,omitempty"`
	NoIndex     bool      `json:"no_index,omitempty"`
}

type renderedMeta struct {
	TitleTag   string
	DescTag    string
	Tags       []string
	FaviconTag string
}

func renderMeta(r *http.Request, cached CachedMeta) renderedMeta {
	var rendered renderedMeta

	if cached.Title != "" {
		rendered.setTitle(cached.Title)
	}
	if cached.Description != "" {
		rendered.setDescription(cached.Description)
	}

	if !cached.NotFound {
		pageURL := absoluteURL(r, r.URL.Path)
		rendered.setCanonical(pageURL)

		imageURL := absoluteURL(r, cached.Image)
		if imageURL != "" {
			rendered.setImage(imageURL, cached.ImageAlt)
			rendered.setImageMeta(cached.ImageMeta)
		}
	}

	if favicon := absoluteURL(r, cached.Favicon); favicon != "" {
		rendered.setFavicon(favicon)
	}

	rendered.setDefaults(cached.SiteName)
	if cached.NoIndex || cached.NotFound {
		rendered.addName("robots", "noindex, nofollow")
	}
	return rendered
}

func (m *renderedMeta) setTitle(title string) {
	m.TitleTag = "<title>" + htmlEscape(title) + "</title>"
	m.addProperty("og:title", title)
	m.addName("twitter:title", title)
}

func (m *renderedMeta) setDescription(desc string) {
	m.DescTag = `<meta name="description" content="` + htmlEscape(desc) + `">`
	m.addProperty("og:description", desc)
	m.addName("twitter:description", desc)
}

func (m *renderedMeta) setCanonical(url string) {
	if url == "" {
		return
	}
	m.Tags = append(m.Tags, `<link rel="canonical" href="`+htmlEscape(url)+`">`)
	m.addProperty("og:url", url)
}

func (m *renderedMeta) setImage(url, alt string) {
	m.addProperty("og:image", url)
	m.addName("twitter:image", url)
	if alt != "" {
		m.addProperty("og:image:alt", alt)
		m.addName("twitter:image:alt", alt)
	}
}

func (m *renderedMeta) setFavicon(url string) {
	m.FaviconTag = `<link rel="icon" href="` + htmlEscape(url) + `">`
}

func (m *renderedMeta) setImageMeta(meta ImageMeta) {
	if meta.Width > 0 {
		m.addProperty("og:image:width", strconv.Itoa(meta.Width))
	}
	if meta.Height > 0 {
		m.addProperty("og:image:height", strconv.Itoa(meta.Height))
	}
	if meta.MIME != "" {
		m.addProperty("og:image:type", meta.MIME)
	}
}

func (m *renderedMeta) setDefaults(siteName string) {
	m.addProperty("og:type", "website")
	m.addName("twitter:card", "summary_large_image")
	if siteName != "" {
		m.addProperty("og:site_name", siteName)
	}
}

func (m *renderedMeta) addProperty(property, content string) {
	m.Tags = append(m.Tags, `<meta property="`+htmlEscape(property)+`" content="`+htmlEscape(content)+`">`)
}

func (m *renderedMeta) addName(name, content string) {
	m.Tags = append(m.Tags, `<meta name="`+htmlEscape(name)+`" content="`+htmlEscape(content)+`">`)
}
