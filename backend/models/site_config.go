package models

import "time"

// SiteConfig is a key=>JSON-value row from the site_config table.
type SiteConfig struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"` // raw JSON string
	UpdatedAt time.Time `json:"updated_at"`
}

// PageSection is an ordered block on a custom page (not just the landing page).
type PageSection struct {
	ID           int64       `json:"id"`
	DisplayOrder int         `json:"display_order"`
	SectionType  string      `json:"section_type"` // hero, card_group, stat_cards, social_links, image_gallery, feature_grid, cta
	Heading      string      `json:"heading"`
	Subheading   string      `json:"subheading"`
	Config       string      `json:"config"` // raw JSON
	Items        []*PageItem `json:"items,omitempty"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

// PageItem is a card/tile/image within a section.
type PageItem struct {
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

type PageItemCardWidth string

const (
	PageItemCardWidthNarrow  PageItemCardWidth = "narrow"
	PageItemCardWidthRegular PageItemCardWidth = "regular"
	PageItemCardWidthWide    PageItemCardWidth = "wide"
	PageItemCardWidthFull    PageItemCardWidth = "full"
)

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
	Visibility  string    `json:"visibility"` // "public", "private", "unlisted"
	Content     string    `json:"content"`    // raw JSON array of sections
	OwnerID     *int64    `json:"owner_id,omitempty"`
	ViewCount   int       `json:"view_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Enriched fields (not stored directly in pages table)
	Owner        *PageUser   `json:"owner,omitempty"`
	Editors      []*PageUser `json:"editors,omitempty"`
	Likes        int         `json:"likes"`
	IsLiked      bool        `json:"is_liked,omitempty"`
	CommentCount int         `json:"comment_count"`
	CanEdit      bool        `json:"can_edit,omitempty"`
	CanDelete    bool        `json:"can_delete,omitempty"`
}

// PageComment represents a comment on a custom page.
type PageComment struct {
	ID           int64     `json:"id"`
	PageID       int64     `json:"page_id"`
	UserID       int64     `json:"user_id"`
	Content      string    `json:"content"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	AuthorName   string    `json:"author_name,omitempty"`
	AuthorRoles  []string  `json:"author_roles,omitempty"`
	AuthorAvatar string    `json:"author_avatar,omitempty"`
	Likes        int       `json:"likes,omitempty"`
	IsLiked      bool      `json:"is_liked,omitempty"`
	CanEdit      bool      `json:"can_edit,omitempty"`
	CanDelete    bool      `json:"can_delete,omitempty"`
}

// PageUser is a lightweight user representation for page ownership/editor lists.
type PageUser struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

// PageEditor is a junction row granting edit access to a user on a page.
type PageEditor struct {
	ID        int64     `json:"id"`
	PageID    int64     `json:"page_id"`
	UserID    int64     `json:"user_id"`
	GrantedBy *int64    `json:"granted_by,omitempty"`
	GrantedAt time.Time `json:"granted_at"`
}

// UserPageAllocation tracks how many custom pages a user is allowed to own.
type UserPageAllocation struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	MaxPages  int       `json:"max_pages"`
	UsedPages int       `json:"used_pages"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Enriched fields (not stored)
	Username    string `json:"username,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}
