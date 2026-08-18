package seo

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/skaia/backend/models"
)

type fakeConfigProvider struct {
	values map[string]*models.SiteConfig
	err    error
}

func (f fakeConfigProvider) GetConfig(key string) (*models.SiteConfig, error) {
	if f.err != nil {
		return nil, f.err
	}
	if value, ok := f.values[key]; ok {
		return value, nil
	}
	return nil, sql.ErrNoRows
}

type fakeMetadataCache struct {
	mu       sync.Mutex
	getMeta  CachedMeta
	getOK    bool
	getErr   error
	setErr   error
	setCalls int
	setMeta  CachedMeta
}

func (f *fakeMetadataCache) Get(context.Context, string) (CachedMeta, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.getMeta, f.getOK, f.getErr
}

func (f *fakeMetadataCache) Set(_ context.Context, _ string, meta CachedMeta, _ time.Duration) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.setCalls++
	f.setMeta = meta
	return f.setErr
}

func (f *fakeMetadataCache) writes() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.setCalls
}

func testHandler(path string, cache metadataCache, config configProvider, resolve func(context.Context, *http.Request) seoResolution) http.HandlerFunc {
	return newIndexHandler(handlerDependencies{
		config:    config,
		cache:     cache,
		resolve:   resolve,
		readFile:  os.ReadFile,
		indexPath: path,
	})
}

func TestIndexHandlerRetriesMissingTemplateAndObservesHotShip(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	dir := t.TempDir()
	indexPath := filepath.Join(dir, "index.html")
	cache := &fakeMetadataCache{}
	handler := testHandler(indexPath, cache, fakeConfigProvider{}, func(context.Context, *http.Request) seoResolution {
		return seoResolution{Route: routeSEO{Title: "Route"}, State: resolutionSuccess}
	})

	first := serveRequest(handler, "/")
	assertUnavailable(t, first)
	if cache.writes() != 0 {
		t.Fatalf("missing template wrote %d cache entries", cache.writes())
	}

	writeIndex(t, indexPath, "first-build")
	second := serveRequest(handler, "/")
	if second.Code != http.StatusOK || !strings.Contains(second.Body.String(), "first-build") {
		t.Fatalf("first hot ship = %d %q", second.Code, second.Body.String())
	}

	writeIndex(t, indexPath, "second-build")
	third := serveRequest(handler, "/")
	if third.Code != http.StatusOK || !strings.Contains(third.Body.String(), "second-build") || strings.Contains(third.Body.String(), "first-build") {
		t.Fatalf("replacement hot ship = %d %q", third.Code, third.Body.String())
	}
}

func TestConfiguredIndexPathHonorsOverrideAndFallback(t *testing.T) {
	t.Setenv("INDEX_FILE_PATH", "/tmp/custom-index.html")
	if got := configuredIndexPath(); got != "/tmp/custom-index.html" {
		t.Fatalf("configured path = %q", got)
	}
	t.Setenv("INDEX_FILE_PATH", "")
	if got := configuredIndexPath(); got != defaultIndexFilePath {
		t.Fatalf("fallback path = %q", got)
	}
}

func TestIndexHandlerDependencyOutcomesControlStatusAndCaching(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	indexPath := filepath.Join(t.TempDir(), "index.html")
	writeIndex(t, indexPath, "dependency-test")

	tests := []struct {
		name       string
		resolution seoResolution
		wantStatus int
		wantWrites int
	}{
		{name: "success", resolution: seoResolution{Route: routeSEO{Title: "Found"}, State: resolutionSuccess}, wantStatus: 200, wantWrites: 1},
		{name: "authoritative absence", resolution: seoResolution{Route: routeSEO{Miss: true}, State: resolutionAbsence}, wantStatus: 404, wantWrites: 1},
		{name: "optional degradation", resolution: seoResolution{Route: routeSEO{Title: "Base"}, State: resolutionDegraded, Err: errors.New("thumbnail unavailable")}, wantStatus: 200, wantWrites: 0},
		{name: "dependency error", resolution: seoResolution{State: resolutionError, Err: context.DeadlineExceeded}, wantStatus: 503, wantWrites: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cache := &fakeMetadataCache{}
			handler := testHandler(indexPath, cache, fakeConfigProvider{}, func(context.Context, *http.Request) seoResolution {
				return tt.resolution
			})
			rec := serveRequest(handler, "/page/test")
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := cache.writes(); got != tt.wantWrites {
				t.Fatalf("cache writes = %d, want %d", got, tt.wantWrites)
			}
			if tt.wantStatus == http.StatusServiceUnavailable {
				assertUnavailable(t, rec)
			}
		})
	}
}

func TestIndexHandlerConfigAndCacheFailuresAreFailSafe(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	indexPath := filepath.Join(t.TempDir(), "index.html")
	writeIndex(t, indexPath, "failure-test")
	resolve := func(context.Context, *http.Request) seoResolution {
		return seoResolution{Route: routeSEO{Title: "Found"}, State: resolutionSuccess}
	}

	t.Run("malformed config", func(t *testing.T) {
		cache := &fakeMetadataCache{}
		config := fakeConfigProvider{values: map[string]*models.SiteConfig{"branding": {Value: "{"}}}
		rec := serveRequest(testHandler(indexPath, cache, config, resolve), "/")
		assertUnavailable(t, rec)
		if cache.writes() != 0 {
			t.Fatalf("malformed config wrote cache")
		}
	})

	t.Run("config dependency", func(t *testing.T) {
		cache := &fakeMetadataCache{}
		rec := serveRequest(testHandler(indexPath, cache, fakeConfigProvider{err: context.Canceled}, resolve), "/")
		assertUnavailable(t, rec)
		if cache.writes() != 0 {
			t.Fatalf("config failure wrote cache")
		}
	})

	t.Run("cache read failure falls back", func(t *testing.T) {
		cache := &fakeMetadataCache{getErr: errors.New("redis unavailable")}
		rec := serveRequest(testHandler(indexPath, cache, fakeConfigProvider{}, resolve), "/")
		if rec.Code != http.StatusOK || cache.writes() != 1 {
			t.Fatalf("fallback = status %d, writes %d", rec.Code, cache.writes())
		}
	})

	t.Run("cache write failure does not change response", func(t *testing.T) {
		cache := &fakeMetadataCache{setErr: errors.New("redis unavailable")}
		rec := serveRequest(testHandler(indexPath, cache, fakeConfigProvider{}, resolve), "/")
		if rec.Code != http.StatusOK || cache.writes() != 1 {
			t.Fatalf("response = status %d, writes %d", rec.Code, cache.writes())
		}
	})
}

type stubRow func(dest ...any) error

func (s stubRow) Scan(dest ...any) error { return s(dest...) }

type stubQueryer struct{ row rowScanner }

func (s stubQueryer) QueryRowContext(context.Context, string, ...any) rowScanner { return s.row }

func TestDocumentationArticleRouteSEO(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/doc/platform/getting-started", nil)
	result := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(dest ...any) error {
		*dest[0].(*string) = "Getting started"
		*dest[1].(*string) = "Install and configure the platform."
		*dest[2].(*string) = `<p>Guide body</p><img src="https://cdn.example/guide.png">`
		return nil
	})}, req)
	if result.State != resolutionSuccess || result.Route.Title != "Getting started" {
		t.Fatalf("documentation SEO resolution = %#v", result)
	}
	if result.Route.Desc != "Install and configure the platform." || result.Route.Image != "https://cdn.example/guide.png" {
		t.Fatalf("documentation SEO metadata = %#v", result.Route)
	}
}

func TestCustomPageRouteSEODerivesMetadataFromOrderedSections(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/page/community-story", nil)
	content := `[
		{"display_order":2,"section_type":"image_gallery","heading":"Gallery","subheading":"","config":{},"items":[
			{"display_order":2,"heading":"Second","subheading":"","image_url":"/uploads/second.webp"},
			{"display_order":1,"heading":"First","subheading":"","image_url":"/uploads/first.webp"}
		]},
		{"display_order":1,"section_type":"hero","heading":"A Community Story","subheading":"How this community grew together.","config":"{\"background_image\":\"/uploads/hero.jpg\"}"}
	]`
	result := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(dest ...any) error {
		*dest[0].(*string) = ""
		*dest[1].(*string) = ""
		*dest[5].(*string) = content
		return nil
	})}, req)

	if result.State != resolutionSuccess {
		t.Fatalf("custom page SEO resolution = %#v", result)
	}
	if result.Route.Title != "A Community Story" || result.Route.Desc != "How this community grew together." {
		t.Fatalf("custom page text metadata = %#v", result.Route)
	}
	if result.Route.Image != "/uploads/hero.jpg" {
		t.Fatalf("custom page image metadata = %#v", result.Route)
	}
}

func TestCustomPageExplicitSEOOverridesContentFieldByField(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/page/launch", nil)
	result := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(dest ...any) error {
		*dest[0].(*string) = "Page title"
		*dest[1].(*string) = "Page description"
		*dest[2].(*string) = "Explicit search title"
		*dest[3].(*string) = "Explicit search description"
		*dest[4].(*string) = "/uploads/social.webp"
		*dest[5].(*string) = `[{"section_type":"hero","config":{"background_image":"/uploads/hero.webp"}}]`
		return nil
	})}, req)

	if result.State != resolutionSuccess {
		t.Fatalf("explicit page SEO resolution = %#v", result)
	}
	if result.Route.Title != "Explicit search title" || result.Route.Desc != "Explicit search description" || result.Route.Image != "/uploads/social.webp" {
		t.Fatalf("explicit page SEO metadata = %#v", result.Route)
	}
}

func TestCustomPageRouteSEOUsesRichTextAndMediaSectionFallbacks(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/page/community-guide", nil)
	content := `[
		{"display_order":1,"section_type":"rich_text","heading":"Guide","subheading":"","config":{"content":"<p>Practical &amp; welcoming advice for every new member.</p>"}},
		{"display_order":2,"section_type":"image_gallery","heading":"Photos","subheading":"","config":{},"items":[
			{"display_order":1,"image_url":"https://cdn.example/guide.png"}
		]}
	]`
	result := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(dest ...any) error {
		*dest[0].(*string) = "Community Guide"
		*dest[1].(*string) = ""
		*dest[5].(*string) = content
		return nil
	})}, req)

	if result.Route.Title != "Community Guide" || result.Route.Desc != "Practical & welcoming advice for every new member." {
		t.Fatalf("rich-text page metadata = %#v", result.Route)
	}
	if result.Route.Image != "https://cdn.example/guide.png" {
		t.Fatalf("gallery fallback image = %q", result.Route.Image)
	}
}

func TestCustomPageRichTextUsesForumStyleEmbeddedImage(t *testing.T) {
	meta, err := extractPageContentSEO(`[{"display_order":1,"section_type":"rich_text","config":{"content":"<p>Story</p><img src=\"/uploads/story.webp\">"}}]`)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Desc != "Story" || meta.Image != "/uploads/story.webp" {
		t.Fatalf("embedded rich-text metadata = %#v", meta)
	}
}

func TestLandingCustomPageUsesContentDerivedSEO(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	result := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(dest ...any) error {
		*dest[0].(*string) = "home"
		*dest[1].(*string) = "Welcome Home"
		*dest[2].(*string) = "A content-specific landing page."
		*dest[6].(*string) = `[{"display_order":1,"section_type":"hero","config":{"background_image":"/uploads/home.webp"}}]`
		return nil
	})}, req)

	if result.State != resolutionSuccess {
		t.Fatalf("landing page SEO resolution = %#v", result)
	}
	if result.Route.Title != "Welcome Home" || result.Route.Desc != "A content-specific landing page." || result.Route.Image != "/uploads/home.webp" {
		t.Fatalf("landing page metadata = %#v", result.Route)
	}
}

func TestMissingLandingCustomPageRetainsGlobalHomeSEO(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	result := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(...any) error {
		return sql.ErrNoRows
	})}, req)
	if result.State != resolutionSuccess || result.Route.Miss {
		t.Fatalf("missing landing page resolution = %#v", result)
	}
}

func TestRouteDatabaseErrorsNeverBecomeCacheableAbsence(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/page/example", nil)

	missing := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(...any) error { return sql.ErrNoRows })}, req)
	if missing.State != resolutionAbsence || !missing.Route.Miss {
		t.Fatalf("sql.ErrNoRows resolution = %#v", missing)
	}

	for _, dependencyErr := range []error{context.DeadlineExceeded, context.Canceled, errors.New("connection refused")} {
		result := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(...any) error { return dependencyErr })}, req)
		if result.State != resolutionError || result.Route.Miss {
			t.Errorf("dependency error %v resolution = %#v", dependencyErr, result)
		}
	}

	malformed := resolveRouteSEO(context.Background(), stubQueryer{row: stubRow(func(dest ...any) error {
		*dest[0].(*string) = "Example"
		*dest[1].(*string) = "Description"
		*dest[5].(*string) = "{"
		return nil
	})}, req)
	if malformed.State != resolutionDegraded || malformed.Route.Miss || malformed.Err == nil {
		t.Fatalf("malformed optional content resolution = %#v", malformed)
	}
}

func TestIndexHandlerConcurrentTemplateReplacement(t *testing.T) {
	t.Setenv("DOMAINS", "example.com")
	dir := t.TempDir()
	indexPath := filepath.Join(dir, "index.html")
	writeIndex(t, indexPath, "build-a")
	handler := testHandler(indexPath, nil, fakeConfigProvider{}, func(context.Context, *http.Request) seoResolution {
		return seoResolution{State: resolutionSuccess}
	})

	var wg sync.WaitGroup
	errs := make(chan string, 64)
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				rec := serveRequest(handler, "/")
				body := rec.Body.String()
				if rec.Code != http.StatusOK || !strings.Contains(body, "build-a") && !strings.Contains(body, "build-b") {
					errs <- body
					return
				}
			}
		}()
	}
	replacement := filepath.Join(dir, "replacement.html")
	writeIndex(t, replacement, "build-b")
	if err := os.Rename(replacement, indexPath); err != nil {
		t.Fatal(err)
	}
	wg.Wait()
	close(errs)
	for body := range errs {
		t.Fatalf("unexpected concurrent response %q", body)
	}
	if rec := serveRequest(handler, "/"); !strings.Contains(rec.Body.String(), "build-b") {
		t.Fatalf("handler did not converge to replacement: %q", rec.Body.String())
	}
}

func serveRequest(handler http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "https://example.com"+path, nil))
	return rec
}

func assertUnavailable(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	for name, want := range map[string]string{
		"Cache-Control": "no-store, no-cache, must-revalidate",
		"Retry-After":   retryAfterSeconds,
		"X-Robots-Tag":  "noindex, nofollow",
	} {
		if got := rec.Header().Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
}

func writeIndex(t *testing.T, path, marker string) {
	t.Helper()
	doc := strings.Replace(testIndexHTML, `<div id="root"></div>`, `<div id="root">`+marker+`</div>`, 1)
	if err := os.WriteFile(path, []byte(doc), 0o600); err != nil {
		t.Fatal(err)
	}
}
