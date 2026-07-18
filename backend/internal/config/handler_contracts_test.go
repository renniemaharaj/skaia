package config

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/s_registry"
)

func TestSectionContractsRoutePublishesEmbeddedSchemas(t *testing.T) {
	router := chi.NewRouter()
	handler := NewHandler(nil, nil, nil, nil)
	handler.Mount(router, func(next http.Handler) http.Handler { return next })

	request := httptest.NewRequest(http.MethodGet, "/config/section-contracts", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", response.Code, response.Body.String())
	}

	var contracts map[string]json.RawMessage
	if err := json.Unmarshal(response.Body.Bytes(), &contracts); err != nil {
		t.Fatalf("decode section contracts: %v", err)
	}
	for _, name := range []string{s_registry.SharedSectionShellV1, s_registry.PageThemeV1} {
		if len(contracts[name]) == 0 {
			t.Fatalf("expected embedded %q contract in response", name)
		}
	}
}
