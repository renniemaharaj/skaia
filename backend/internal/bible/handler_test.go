package bible

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()
	repo, err := NewRepository()
	if err != nil {
		t.Fatalf("NewRepository() error = %v", err)
	}
	router := chi.NewRouter()
	NewHandler(NewService(repo)).Mount(router)
	return router
}

func TestHandlerListBooks(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/bible/kjv/books", nil)
	response := httptest.NewRecorder()
	newTestRouter(t).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store, no-cache, must-revalidate" {
		t.Fatalf("Cache-Control = %q", got)
	}

	var payload BookList
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Translation.Code != TranslationCode || len(payload.Books) != CorpusBooks {
		t.Fatalf("unexpected response: translation=%q books=%d", payload.Translation.Code, len(payload.Books))
	}
}

func TestHandlerGetBookAndNotFound(t *testing.T) {
	router := newTestRouter(t)

	t.Run("known canonical slug", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/bible/kjv/books/matthew", nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)

		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
		}
		var payload Book
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if payload.Title != "Matthew" || payload.Chapters["6"]["25"] == "" {
			t.Fatalf("unexpected Matthew response: %#v", payload)
		}
	})

	t.Run("unknown book", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/bible/kjv/books/unknown", nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)

		if response.Code != http.StatusNotFound {
			t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
		}
		var payload map[string]string
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if payload["error"] != "bible book not found" {
			t.Fatalf("error = %q", payload["error"])
		}
	})
}
