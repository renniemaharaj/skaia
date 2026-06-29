package ssr

import "strconv"

type CachedMeta struct {
	TitleTag   string   `json:"title_tag"`
	DescTag    string   `json:"desc_tag"`
	OGTags     []string `json:"og_tag"`
	FaviconTag string   `json:"favicon_tag"`
}

func (c *CachedMeta) setTitle(title string) *CachedMeta {
	c.TitleTag = "<title>" + htmlEscape(title) + "</title>"
	return c
}

func (c *CachedMeta) setDescription(desc string) *CachedMeta {
	c.DescTag = "<meta name=\"description\" content=\"" + htmlEscape(desc) + "\">"
	return c
}

func (c *CachedMeta) setOGImage(imgURL string) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta property=\"og:image\" content=\""+htmlEscape(imgURL)+"\">")
	return c
}

func (c *CachedMeta) setFavicon(imgURL string) *CachedMeta {
	c.FaviconTag = "<link rel=\"icon\" href=\"" + htmlEscape(imgURL) + "\">"
	return c
}

func (c *CachedMeta) setTypeWebsite() *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta property=\"og:type\" content=\"website\">")
	return c
}

func (c *CachedMeta) setOGImageWidth(width int) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta property=\"og:image:width\" content=\""+strconv.Itoa(width)+"\">")
	return c
}

func (c *CachedMeta) setOGImageHeight(height int) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta property=\"og:image:height\" content=\""+strconv.Itoa(height)+"\">")
	return c
}

func (c *CachedMeta) setOGImageType(imgType string) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta property=\"og:image:type\" content=\""+htmlEscape(imgType)+"\">")
	return c
}

func (c *CachedMeta) setTwitterCard(cardType string) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta name=\"twitter:card\" content=\""+htmlEscape(cardType)+"\">")
	return c
}

func (c *CachedMeta) setTwitterCreator(creator string) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta name=\"twitter:creator\" content=\""+htmlEscape(creator)+"\">")
	return c
}

func (c *CachedMeta) setOGDescription(desc string) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta property=\"og:description\" content=\""+htmlEscape(desc)+"\">")
	return c
}

func (c *CachedMeta) setOGSiteName(siteName string) *CachedMeta {
	c.OGTags = append(c.OGTags, "<meta property=\"og:site_name\" content=\""+htmlEscape(siteName)+"\">")
	return c
}
