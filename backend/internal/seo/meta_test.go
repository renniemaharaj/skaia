package seo

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/skaia/backend/models"
)

const testIndexHTML = `<!doctype html><html><head>
%TITLE_PLACEHOLDER%
%META_DESCRIPTION_PLACEHOLDER%
  %OG_IMAGE_PLACEHOLDER%
%FAVICON_PLACEHOLDER%
</head><body><div id="root"></div></body></html>`

func TestRenderedMetaUsesCanonicalTenantOriginAndEscapesOnce(t *testing.T) {
	t.Setenv("DOMAINS", "thewriterco.com slushup.thewriterco.com")
	t.Setenv("PUBLIC_BASE_URL", "https://thewriterco.com")

	cached := buildMeta(
		models.Branding{
			SiteName:   "TheWriterCo",
			LogoURL:    "/logo.png",
			FaviconURL: "/favicon.png",
		},
		models.SEO{
			Title:       "The Writer's Home",
			Description: "Writing & faith don't conflict.",
			OGImage:     "/social.png",
		},
		routeSEO{},
	)

	req := httptest.NewRequest("GET", "http://slushup.thewriterco.com/forum", nil)
	req.Header.Set("X-Forwarded-Host", "poison.example")
	req.Header.Set("X-Forwarded-Proto", "http")
	rec := httptest.NewRecorder()
	serveInjected(rec, req, []byte(testIndexHTML), cached, 200)
	body := rec.Body.String()

	for _, expected := range []string{
		"<title>The Writer&#39;s Home</title>",
		`content="Writing &amp; faith don&#39;t conflict."`,
		`href="https://thewriterco.com/forum"`,
		`content="https://thewriterco.com/forum"`,
		`content="https://thewriterco.com/social.png"`,
		`href="https://thewriterco.com/favicon.png"`,
		`property="og:image:alt" content="The Writer&#39;s Home"`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("rendered metadata missing %q:\n%s", expected, body)
		}
	}
	for _, forbidden := range []string{"slushup.thewriterco.com", "poison.example", "&amp;#39;", `content="http://`} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("rendered metadata contains %q:\n%s", forbidden, body)
		}
	}
}

func TestSemanticCacheOutputIsHostAndAuthenticationIndependent(t *testing.T) {
	t.Setenv("DOMAINS", "example.com www.example.com alias.example.com")
	t.Setenv("PUBLIC_BASE_URL", "https://example.com")
	cached := CachedMeta{
		Version: cachedMetaVersion,
		Title:   "Example",
		Image:   "/image.png",
		Favicon: "/favicon.png",
	}

	render := func(rawURL, cookie, forwardedProto string) string {
		req := httptest.NewRequest("GET", rawURL, nil)
		if cookie != "" {
			req.Header.Set("Cookie", cookie)
		}
		if forwardedProto != "" {
			req.Header.Set("X-Forwarded-Proto", forwardedProto)
		}
		rec := httptest.NewRecorder()
		serveInjected(rec, req, []byte(testIndexHTML), cached, 200)
		return rec.Body.String()
	}

	baseline := render("https://example.com/forum", "", "")
	permutations := []struct {
		url            string
		cookie         string
		forwardedProto string
	}{
		{url: "http://alias.example.com/forum", cookie: "token=administrator", forwardedProto: "http"},
		{url: "http://www.example.com/forum", forwardedProto: "https"},
		{url: "http://site42.example.com/forum", cookie: "session=signed-in"},
		{url: "http://localhost/forum", forwardedProto: "http"},
		{url: "http://hostile.invalid/forum", cookie: "token=administrator", forwardedProto: "https"},
	}
	for _, permutation := range permutations {
		got := render(permutation.url, permutation.cookie, permutation.forwardedProto)
		if got != baseline {
			t.Errorf("semantic output differs for %#v:\nbaseline:\n%s\ngot:\n%s", permutation, baseline, got)
		}
	}
}

func TestMissingRouteIs404AndNoIndex(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	req := httptest.NewRequest("GET", "https://example.com/does-not-exist", nil)
	resolution := resolveRouteSEO(context.Background(), nil, req)
	route := resolution.Route
	if resolution.State != resolutionAbsence || !route.Miss || !route.NoIndex {
		t.Fatalf("unknown route = %#v, want missing and noindex", route)
	}

	rec := httptest.NewRecorder()
	serveInjected(rec, req, []byte(testIndexHTML), buildMeta(models.Branding{SiteName: "Example"}, models.SEO{}, route), 404)
	if rec.Code != 404 {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if got := rec.Header().Get("X-Robots-Tag"); got != "noindex, nofollow" {
		t.Fatalf("X-Robots-Tag = %q", got)
	}
	if !strings.Contains(rec.Body.String(), `name="robots" content="noindex, nofollow"`) {
		t.Fatalf("missing robots noindex: %s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `rel="canonical"`) || strings.Contains(rec.Body.String(), `property="og:url"`) {
		t.Fatalf("404 emitted canonical URL: %s", rec.Body.String())
	}
}

func TestKnownPrivateRouteIsNoIndexWithout404(t *testing.T) {
	req := httptest.NewRequest("GET", "https://example.com/admin/meta/seo", nil)
	route := resolveRouteSEO(context.Background(), nil, req).Route
	if route.Miss || !route.NoIndex {
		t.Fatalf("private route = %#v, want noindex without miss", route)
	}
}

func TestDocumentationManagementRoutesAreNoIndexWithoutLookup(t *testing.T) {
	for _, path := range []string{
		"/doc/new",
		"/doc/manage/platform/settings",
		"/doc/manage/platform/guides/new",
		"/doc/manage/platform/guides/install",
	} {
		req := httptest.NewRequest("GET", "https://example.com"+path, nil)
		resolution := resolveRouteSEO(context.Background(), nil, req)
		if resolution.State != resolutionSuccess || resolution.Route.Miss || !resolution.Route.NoIndex {
			t.Errorf("%s route = %#v, want successful noindex shell", path, resolution)
		}
	}
}

func TestAuthenticationRoutesAreNoIndexWithout404(t *testing.T) {
	for _, path := range []string{"/login", "/register", "/forgot-password", "/reset-password"} {
		req := httptest.NewRequest("GET", "https://example.com"+path, nil)
		route := resolveRouteSEO(context.Background(), nil, req).Route
		if route.Miss || !route.NoIndex {
			t.Errorf("%s route = %#v, want noindex without miss", path, route)
		}
	}
}

func TestSnipPreservesUTF8AndMaximumLength(t *testing.T) {
	got := snip(strings.Repeat("é", 20), 10)
	if got != strings.Repeat("é", 7)+"..." {
		t.Fatalf("snip result = %q", got)
	}
	if len([]rune(got)) != 10 {
		t.Fatalf("snip rune length = %d, want 10", len([]rune(got)))
	}
}

func TestImageMetadataDoesNotFetchRemoteContent(t *testing.T) {
	meta := imageMetaFromReference("http://169.254.169.254/latest/meta-data/image.png")
	if meta.MIME != "image/png" || meta.Width != 0 || meta.Height != 0 {
		t.Fatalf("image meta = %#v", meta)
	}
}

func TestLiveStreamMetadataIsNeverCached(t *testing.T) {
	for _, route := range []routeSEO{
		{Live: true},
		{Live: true, Miss: true},
	} {
		if ttl, cacheable := routeCacheTTL(route); cacheable || ttl != 0 {
			t.Fatalf("live route cache policy = (%s, %v), want uncacheable", ttl, cacheable)
		}
	}
	if ttl, cacheable := routeCacheTTL(routeSEO{Miss: true}); !cacheable || ttl != 5*time.Minute {
		t.Fatalf("ordinary miss cache policy = (%s, %v)", ttl, cacheable)
	}
}
