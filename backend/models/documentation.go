package models

import "time"

type Documentation struct {
	ID          int64     `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Visibility  string    `json:"visibility"`
	OwnerID     int64     `json:"owner_id"`
	Revision    int64     `json:"revision"`
	CanEdit     bool      `json:"can_edit"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type DocumentationSection struct {
	ID              int64     `json:"id"`
	DocumentationID int64     `json:"documentation_id"`
	Title           string    `json:"title"`
	DisplayOrder    int       `json:"display_order"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type DocumentationArticle struct {
	ID              int64     `json:"id"`
	DocumentationID int64     `json:"documentation_id"`
	SectionID       *int64    `json:"section_id,omitempty"`
	Slug            string    `json:"slug"`
	Title           string    `json:"title"`
	Summary         string    `json:"summary"`
	Content         string    `json:"content,omitempty"`
	DisplayOrder    int       `json:"display_order"`
	AuthorID        int64     `json:"author_id"`
	LastEditedBy    int64     `json:"last_edited_by"`
	Revision        int64     `json:"revision"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type DocumentationManifest struct {
	Documentation *Documentation         `json:"documentation"`
	Sections      []DocumentationSection `json:"sections"`
	Articles      []DocumentationArticle `json:"articles"`
}

type DocumentationArticleView struct {
	Article  *DocumentationArticle `json:"article"`
	Previous *DocumentationArticle `json:"previous,omitempty"`
	Next     *DocumentationArticle `json:"next,omitempty"`
}

type DocumentationSearchResult struct {
	ArticleID int64  `json:"article_id"`
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	Excerpt   string `json:"excerpt"`
	SectionID *int64 `json:"section_id,omitempty"`
}
