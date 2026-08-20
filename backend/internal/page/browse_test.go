package page

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/models"
)

type browseRepo struct {
	Repository
	result        *BrowseResult
	browseErr     error
	browseCalls   int
	lastOptions   BrowseOptions
	page          *models.Page
	pageErr       error
	isEditor      bool
	isEditorErr   error
	isEditorCalls int
}

func (r *browseRepo) BrowsePages(options BrowseOptions) (*BrowseResult, error) {
	r.browseCalls++
	r.lastOptions = options
	return r.result, r.browseErr
}

func (r *browseRepo) GetByID(int64) (*models.Page, error) {
	return r.page, r.pageErr
}

func (r *browseRepo) IsEditor(int64, int64) (bool, error) {
	r.isEditorCalls++
	return r.isEditor, r.isEditorErr
}

func TestBrowsePagesBuildsContentFreeFlagsAndCursor(t *testing.T) {
	updated := time.Date(2026, 8, 20, 12, 30, 0, 123000000, time.UTC)
	ownerID := int64(8)
	repo := &browseRepo{result: &BrowseResult{
		Pages: []*models.PageBrowseSummary{
			{ID: 11, Slug: "owned", OwnerID: &ownerID, UpdatedAt: updated, Editors: []*models.PageUser{}},
			{ID: 10, Slug: "edited", UpdatedAt: updated.Add(-time.Second), Editors: []*models.PageUser{{ID: ownerID}}},
		},
		HasMore: true,
	}}
	svc := NewService(repo, nil)

	response, err := svc.BrowsePages(BrowseRequest{Limit: 2, ActorID: ownerID})
	if err != nil {
		t.Fatal(err)
	}
	if repo.browseCalls != 1 {
		t.Fatalf("expected one batched repository call, got %d", repo.browseCalls)
	}
	if !response.Pages[0].CanEdit || !response.Pages[0].CanDelete || !response.Pages[1].CanEdit {
		t.Fatalf("unexpected action flags: %+v", response.Pages)
	}
	if response.Pages[1].CanDelete {
		t.Fatal("editor must not gain delete permission")
	}
	if !response.HasMore || response.NextCursor == "" {
		t.Fatalf("missing continuation cursor: %+v", response)
	}
	raw, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "content") || strings.Contains(string(raw), "owner_id") {
		t.Fatalf("browse projection leaked document/private join state: %s", raw)
	}

	repo.result = &BrowseResult{Pages: []*models.PageBrowseSummary{}}
	if _, err := svc.BrowsePages(BrowseRequest{Limit: 2, Cursor: response.NextCursor}); err != nil {
		t.Fatal(err)
	}
	if repo.lastOptions.Cursor == nil || repo.lastOptions.Cursor.ID != 10 || !repo.lastOptions.Cursor.UpdatedAt.Equal(updated.Add(-time.Second)) {
		t.Fatalf("cursor did not round-trip: %+v", repo.lastOptions.Cursor)
	}
}

func TestBrowsePagesRejectsInvalidCursor(t *testing.T) {
	repo := &browseRepo{}
	_, err := NewService(repo, nil).BrowsePages(BrowseRequest{Cursor: "not-a-cursor"})
	if !errors.Is(err, ErrInvalidBrowseCursor) {
		t.Fatalf("expected invalid cursor, got %v", err)
	}
	if repo.browseCalls != 0 {
		t.Fatal("invalid cursor must not reach the repository")
	}
}

func TestBrowsePagesDefensivelyBoundsFiveHundredPageFixture(t *testing.T) {
	pages := make([]*models.PageBrowseSummary, 500)
	for index := range pages {
		pages[index] = &models.PageBrowseSummary{
			ID: int64(500 - index), Slug: "fixture", Editors: []*models.PageUser{},
			UpdatedAt: time.Unix(int64(500-index), 0).UTC(),
		}
	}
	repo := &browseRepo{result: &BrowseResult{Pages: pages}}
	response, err := NewService(repo, nil).BrowsePages(BrowseRequest{Limit: 500})
	if err != nil {
		t.Fatal(err)
	}
	if repo.lastOptions.Limit != MaxBrowseLimit || len(response.Pages) != MaxBrowseLimit || !response.HasMore {
		t.Fatalf("500-page fixture was not bounded: options=%+v response=%d", repo.lastOptions, len(response.Pages))
	}
	raw, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "content") {
		t.Fatalf("bounded fixture leaked content: %s", raw)
	}
	const maxBrowseResponseBytes = 64 * 1024
	if len(raw) > maxBrowseResponseBytes {
		t.Fatalf("bounded 100-summary response exceeded %d bytes: %d", maxBrowseResponseBytes, len(raw))
	}
	t.Logf("bounded 500-record input: %d summaries, %d response bytes, %d repository call", len(response.Pages), len(raw), repo.browseCalls)
}

func TestMergePageUpdatePreservesOmittedDocumentFields(t *testing.T) {
	title := "Renamed"
	slug := "renamed"
	current := &models.Page{
		ID: 4, Slug: "original", Title: "Original", Description: "Keep me",
		Visibility: "private", Content: `[{"id":1}]`, SEOTitle: "SEO",
	}
	updated := mergePageUpdate(current, pageUpdateInput{Title: &title, Slug: &slug})
	if updated.Title != title || updated.Slug != slug {
		t.Fatalf("metadata was not updated: %+v", updated)
	}
	if updated.Content != current.Content || updated.Description != current.Description ||
		updated.Visibility != current.Visibility || updated.SEOTitle != current.SEOTitle {
		t.Fatalf("metadata-only update erased omitted page fields: %+v", updated)
	}
}

func TestGetPreviewEnforcesPrivacyAndSanitizesInteractiveRecords(t *testing.T) {
	ownerID := int64(3)
	content := `[{"id":7,"section_type":"form","config":"{\"status\":\"open\",\"result_visibility\":\"never\",\"records\":[{\"id\":\"secret\",\"user_id\":44,\"answers\":{\"name\":\"Private\"}}]}"}]`
	repo := &browseRepo{page: &models.Page{ID: 9, OwnerID: &ownerID, Visibility: "private", Content: content, UpdatedAt: time.Now()}}
	svc := NewService(repo, nil)

	if _, err := svc.GetPreview(9, 0, false); !errors.Is(err, ErrPageForbidden) {
		t.Fatalf("anonymous private preview should be forbidden, got %v", err)
	}
	repo.isEditor = true
	preview, err := svc.GetPreview(9, 44, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(preview.Content, "Private") {
		t.Fatalf("authorized editor lost managed response data: %s", preview.Content)
	}

	repo.page = &models.Page{ID: 10, Visibility: "public", Content: content, UpdatedAt: time.Now()}
	repo.isEditor = false
	preview, err = svc.GetPreview(10, 55, false)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(preview.Content, "Private") || strings.Contains(preview.Content, "secret") {
		t.Fatalf("public preview leaked another user's response: %s", preview.Content)
	}
}

func TestGetPreviewFailsClosedForPrivateEditorLookup(t *testing.T) {
	repo := &browseRepo{
		page:        &models.Page{ID: 9, Visibility: "private", Content: "[]"},
		isEditorErr: errors.New("permission store unavailable"),
	}
	_, err := NewService(repo, nil).GetPreview(9, 44, false)
	if !errors.Is(err, ErrPageForbidden) {
		t.Fatalf("expected fail-closed private preview, got %v", err)
	}
}

func TestBrowseHandlerContractAndValidation(t *testing.T) {
	repo := &browseRepo{result: &BrowseResult{Pages: []*models.PageBrowseSummary{{
		ID: 1, Slug: "summary", Title: "Summary", Editors: []*models.PageUser{}, UpdatedAt: time.Now(),
	}}}}
	handler := NewHandler(NewService(repo, nil), nil, nil, nil, nil, nil)
	router := chi.NewRouter()
	identity := func(next http.Handler) http.Handler { return next }
	handler.Mount(router, identity, identity)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/pages/browse?limit=12&q=summary", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if repo.lastOptions.Limit != 12 || repo.lastOptions.Query != "summary" {
		t.Fatalf("query options not forwarded: %+v", repo.lastOptions)
	}
	if strings.Contains(response.Body.String(), "content") {
		t.Fatalf("handler leaked document content: %s", response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); !strings.Contains(got, "no-store") {
		t.Fatalf("previewable browse response must be no-store, got %q", got)
	}

	for _, path := range []string{"/pages/browse?limit=nope", "/pages/browse?cursor=nope"} {
		response = httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for %s, got %d", path, response.Code)
		}
	}
}

func TestBrowsePreviewHandlerStatusMapping(t *testing.T) {
	for name, test := range map[string]struct {
		repo *browseRepo
		want int
	}{
		"missing": {repo: &browseRepo{pageErr: sql.ErrNoRows}, want: http.StatusNotFound},
		"private": {repo: &browseRepo{page: &models.Page{ID: 2, Visibility: "private", Content: "[]"}}, want: http.StatusForbidden},
		"public":  {repo: &browseRepo{page: &models.Page{ID: 2, Visibility: "public", Content: "[]", UpdatedAt: time.Now()}}, want: http.StatusOK},
	} {
		t.Run(name, func(t *testing.T) {
			handler := NewHandler(NewService(test.repo, nil), nil, nil, nil, nil, nil)
			router := chi.NewRouter()
			identity := func(next http.Handler) http.Handler { return next }
			handler.Mount(router, identity, identity)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/pages/browse/2/preview", nil))
			if response.Code != test.want {
				t.Fatalf("expected %d, got %d: %s", test.want, response.Code, response.Body.String())
			}
		})
	}
}
