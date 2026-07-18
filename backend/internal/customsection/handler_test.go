package customsection

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/models"
)

type presetAliasRepository struct {
	items []*models.CustomSection
}

func (r presetAliasRepository) GetByID(id int64) (*models.CustomSection, error) {
	for _, item := range r.items {
		if item.ID == id {
			return item, nil
		}
	}
	return nil, nil
}
func (r presetAliasRepository) List() ([]*models.CustomSection, error) { return r.items, nil }
func (r presetAliasRepository) ListByDataSource(int64) ([]*models.CustomSection, error) {
	return r.items, nil
}
func (presetAliasRepository) Create(*models.CustomSection) error { return nil }
func (presetAliasRepository) Update(*models.CustomSection) error { return nil }
func (presetAliasRepository) Delete(int64) error                 { return nil }

func TestSectionPresetAndCustomSectionRoutesRemainAliases(t *testing.T) {
	repository := presetAliasRepository{items: []*models.CustomSection{{
		ID: 1, Name: "Cards", DataSourceID: 2, SectionType: "cards", PresetType: "cards", Config: "{}",
	}}}
	handler := NewHandler(NewService(repository), nil)
	router := chi.NewRouter()
	handler.Mount(router, func(next http.Handler) http.Handler { return next })

	for _, path := range []string{"/config/section-presets/", "/config/custom-sections/"} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code != http.StatusOK {
			t.Fatalf("GET %s status = %d", path, recorder.Code)
		}
		var response []models.CustomSection
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
		if len(response) != 1 || response[0].SectionType != "cards" || response[0].PresetType != "cards" {
			t.Fatalf("unexpected %s response: %#v", path, response)
		}
	}
}
