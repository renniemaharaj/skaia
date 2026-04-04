package models

import "time"

// SiteConfig is a key→JSON-value row from the site_config table.
type SiteConfig struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"` // raw JSON string
	UpdatedAt time.Time `json:"updated_at"`
}

// LandingSection is an ordered block on the landing page.
type LandingSection struct {
	ID           int64          `json:"id"`
	DisplayOrder int            `json:"display_order"`
	SectionType  string         `json:"section_type"` // hero, card_group, stat_cards, social_links, image_gallery, feature_grid, cta
	Heading      string         `json:"heading"`
	Subheading   string         `json:"subheading"`
	Config       string         `json:"config"` // raw JSON
	Items        []*LandingItem `json:"items,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

// LandingItem is a card/tile/image within a section.
type LandingItem struct {
	ID           int64     `json:"id"`
	SectionID    int64     `json:"section_id"`
	DisplayOrder int       `json:"display_order"`
	Icon         string    `json:"icon"`
	Heading      string    `json:"heading"`
	Subheading   string    `json:"subheading"`
	ImageURL     string    `json:"image_url"`
	LinkURL      string    `json:"link_url"`
	Config       string    `json:"config"` // raw JSON
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Branding holds site identity fetched from site_config.
type Branding struct {
	SiteName       string `json:"site_name"`
	Tagline        string `json:"tagline"`
	LogoURL        string `json:"logo_url"`
	FaviconURL     string `json:"favicon_url"`
	HeaderTitle    string `json:"header_title"`
	HeaderSubtitle string `json:"header_subtitle"`
	HeaderVariant  int    `json:"header_variant"`
	MenuVariant    int    `json:"menu_variant"`
}

// SEO holds meta tag information from site_config.
type SEO struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	OGImage     string `json:"og_image"`
}

// Footer holds the customisable footer content from site_config.
type Footer struct {
	Variant          int          `json:"variant"`
	SiteTitle        string       `json:"site_title"`
	SiteDescription  string       `json:"site_description"`
	CommunityHeading string       `json:"community_heading"`
	CommunityItems   []string     `json:"community_items"`
	CopyrightText    string       `json:"copyright_text"`
	QuickLinks       []Link       `json:"quick_links"`
	ContactHeading   string       `json:"contact_heading"`
	ContactText      string       `json:"contact_text"`
	Tagline          string       `json:"tagline"`
	SocialLinks      []SocialLink `json:"social_links"`
}

// Link is a named URL used in footer quick links.
type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// SocialLink is an icon-key + URL pair used in footer and landing social sections.
type SocialLink struct {
	Icon string `json:"icon"`
	URL  string `json:"url"`
}

// Page is a routable custom page with block-builder content stored as JSON.
type Page struct {
	ID          int64     `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	IsIndex     bool      `json:"is_index"`
	Content     string    `json:"content"` // raw JSON array of sections
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
