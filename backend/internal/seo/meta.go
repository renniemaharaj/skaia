package seo

import (
	"strconv"
)

type CachedMeta struct {
	TitleTag   string   `json:"title_tag"`
	DescTag    string   `json:"desc_tag"`
	Tags       []string `json:"tags"`
	FaviconTag string   `json:"favicon_tag"`
}

func (c *CachedMeta) setTitle(title string) *CachedMeta {
	title = htmlEscape(title)
	c.TitleTag = "<title>" + title + "</title>"
	c.addProperty("og:title", title)
	c.addName("twitter:title", title)
	return c
}

func (c *CachedMeta) setDescription(desc string) *CachedMeta {
	desc = htmlEscape(desc)
	c.DescTag = `<meta name="description" content="` + desc + `">`
	c.addProperty("og:description", desc)
	c.addName("twitter:description", desc)
	return c
}

func (c *CachedMeta) setCanonical(url string) *CachedMeta {
	c.Tags = append(c.Tags, `<link rel="canonical" href="`+htmlEscape(url)+`">`)
	c.addProperty("og:url", url)
	return c
}

func (c *CachedMeta) setImage(url string) *CachedMeta {
	url = htmlEscape(url)
	c.addProperty("og:image", url)
	c.addName("twitter:image", url)
	return c
}

func (c *CachedMeta) setFavicon(url string) *CachedMeta {
	c.FaviconTag = `<link rel="icon" href="` + htmlEscape(url) + `">`
	return c
}

func (c *CachedMeta) setImageMeta(width, height int, mime string) *CachedMeta {
	if width > 0 {
		c.addProperty("og:image:width", strconv.Itoa(width))
	}
	if height > 0 {
		c.addProperty("og:image:height", strconv.Itoa(height))
	}
	if mime != "" {
		c.addProperty("og:image:type", mime)
	}
	return c
}

func (c *CachedMeta) setDefaults(siteName string) *CachedMeta {
	c.addProperty("og:type", "website")
	c.addName("twitter:card", "summary_large_image")

	if siteName != "" {
		c.addProperty("og:site_name", siteName)
	}

	return c
}

func (c *CachedMeta) addProperty(property, content string) {
	c.Tags = append(c.Tags, `<meta property="`+htmlEscape(property)+`" content="`+htmlEscape(content)+`">`)
}

func (c *CachedMeta) addName(name, content string) {
	c.Tags = append(c.Tags, `<meta name="`+htmlEscape(name)+`" content="`+htmlEscape(content)+`">`)
}
