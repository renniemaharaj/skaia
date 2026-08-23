package session

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestMountPublicExposesOnlyTurnstileConfiguration(t *testing.T) {
	t.Setenv("TURNSTILE_SITE_KEY", "")
	t.Setenv("TURNSTILE_SECRET_KEY", "")
	router := chi.NewRouter()
	NewHandler(NewService(newFakeRepository())).MountPublic(router)

	config := httptest.NewRecorder()
	router.ServeHTTP(config, httptest.NewRequest(http.MethodGet, "/session/turnstile-config", nil))
	if config.Code != http.StatusOK || !strings.Contains(config.Body.String(), `"enabled":false`) {
		t.Fatalf("config response = %d %s", config.Code, config.Body.String())
	}

	list := httptest.NewRecorder()
	router.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/session/", nil))
	if list.Code != http.StatusNotFound {
		t.Fatalf("public mount exposed session listing: %d", list.Code)
	}
}
