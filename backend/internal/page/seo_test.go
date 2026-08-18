package page

import (
	"errors"
	"strings"
	"testing"

	"github.com/skaia/backend/models"
)

func TestNormalizePageSEOTrimsAndAcceptsSupportedImages(t *testing.T) {
	page := &models.Page{
		SEOTitle: "  Search title  ",
		SEODesc:  "  Search description  ",
		SEOImage: "  /uploads/social.webp  ",
	}
	if err := normalizePageSEO(page); err != nil {
		t.Fatal(err)
	}
	if page.SEOTitle != "Search title" || page.SEODesc != "Search description" || page.SEOImage != "/uploads/social.webp" {
		t.Fatalf("normalized page SEO = %#v", page)
	}
}

func TestNormalizePageSEORejectsUnsafeOrOversizedValues(t *testing.T) {
	tests := []models.Page{
		{SEOTitle: strings.Repeat("t", 256)},
		{SEODesc: strings.Repeat("d", 501)},
		{SEOImage: "javascript:alert(1)"},
		{SEOImage: "data:image/png;base64,abc"},
	}
	for _, page := range tests {
		if err := normalizePageSEO(&page); !errors.Is(err, ErrInvalidSEO) {
			t.Errorf("normalizePageSEO(%#v) error = %v", page, err)
		}
	}
}
