package page

import (
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
)

func TestTypedSectionRepositoryConflictsAndIndependentWrites(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repository := NewRepository(db)
	typed := repository.(TypedSectionRepository)
	page := &models.Page{
		Slug: "typed-mutation-" + uuid.NewString(), Title: "Typed", Visibility: "private",
		Content: `[
		 {"id":1,"display_order":1,"section_type":"hero","heading":"One","subheading":"","config":{}},
		 {"id":2,"display_order":2,"section_type":"cta","heading":"Two","subheading":"","config":{}}
		]`,
	}
	if err := repository.Create(page); err != nil {
		t.Fatal(err)
	}
	actorID := seededActorID(t, db)
	sections, err := typed.ListTypedSections(page.ID)
	if err != nil || len(sections) != 2 {
		t.Fatalf("typed section list: %#v %v", sections, err)
	}

	first := shadowWriteFromResource(sections[0])
	first.Heading = "One updated"
	sections, err = typed.UpdateTypedSection(page.ID, sections[0].ID, actorID, sections[0].Revision, first)
	if err != nil {
		t.Fatal(err)
	}
	if sections[0].Revision != 2 || sections[0].Heading != "One updated" {
		t.Fatalf("first revision did not advance: %#v", sections[0])
	}
	stale := shadowWriteFromResource(sections[0])
	stale.Heading = "stale overwrite"
	if _, err := typed.UpdateTypedSection(page.ID, sections[0].ID, actorID, 1, stale); !errors.Is(err, ErrSectionRevisionConflict) {
		t.Fatalf("stale same-section update did not conflict: %v", err)
	}
	second := shadowWriteFromResource(sections[1])
	second.Heading = "Two updated"
	sections, err = typed.UpdateTypedSection(page.ID, sections[1].ID, actorID, sections[1].Revision, second)
	if err != nil {
		t.Fatalf("independent section update failed: %v", err)
	}
	if sections[0].Heading != "One updated" || sections[1].Heading != "Two updated" {
		t.Fatalf("independent writes did not converge: %#v", sections)
	}
	stored, err := repository.GetByID(page.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(stored.Content, "One updated") || !strings.Contains(stored.Content, "Two updated") {
		t.Fatalf("legacy rollback projection was not maintained: %s", stored.Content)
	}
}

func TestTypedThemeAndOrderingMutationsAreRevisionGuarded(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repository := NewRepository(db)
	typed := repository.(TypedSectionRepository)
	page := &models.Page{
		Slug: "typed-theme-" + uuid.NewString(), Title: "Theme", Visibility: "private",
		Content: `[{"id":1,"display_order":1,"section_type":"cta","heading":"CTA","subheading":"","config":{}}]`,
	}
	if err := repository.Create(page); err != nil {
		t.Fatal(err)
	}
	actorID := seededActorID(t, db)
	theme, err := typed.UpdatePageTheme(page.ID, actorID, 1, models.PageTheme{Version: 1, Revision: 1, Tokens: []models.PageThemeToken{
		{Key: "brand", Label: "Brand", Value: "#123456", DisplayOrder: 0, Revision: 1},
		{Key: "accent", Label: "Accent", Value: "#abcdef", DisplayOrder: 1, Revision: 1},
	}})
	if err != nil || theme.Revision != 2 {
		t.Fatalf("theme create failed: %#v %v", theme, err)
	}
	// Swapping two occupied positions exercises the deferrable unique ordering constraint.
	theme, err = typed.UpdatePageTheme(page.ID, actorID, 2, models.PageTheme{Version: 1, Revision: 2, Tokens: []models.PageThemeToken{
		{Key: "brand", Label: "Brand", Value: "#123456", DisplayOrder: 1, Revision: 1},
		{Key: "accent", Label: "Accent", Value: "#abcdef", DisplayOrder: 0, Revision: 1},
	}})
	if err != nil || theme.Revision != 3 || theme.Tokens[0].Key != "accent" {
		t.Fatalf("theme reorder failed: %#v %v", theme, err)
	}
	if _, err := typed.UpdatePageTheme(page.ID, actorID, 2, *theme); !errors.Is(err, ErrSectionRevisionConflict) {
		t.Fatalf("stale theme update did not conflict: %v", err)
	}

	sections, err := typed.ListTypedSections(page.ID)
	if err != nil {
		t.Fatal(err)
	}
	write := shadowWriteFromResource(sections[0])
	write.Shell.BackgroundColor = ShadowColorSource{Mode: "palette", Token: "brand"}
	if _, err := typed.UpdateTypedSection(page.ID, sections[0].ID, actorID, sections[0].Revision, write); err != nil {
		t.Fatal(err)
	}
	if _, err := typed.UpdatePageTheme(page.ID, actorID, 3, models.PageTheme{Version: 1, Revision: 3, Tokens: []models.PageThemeToken{
		{Key: "accent", Label: "Accent", Value: "#abcdef", DisplayOrder: 0, Revision: 2},
	}}); !errors.Is(err, ErrPaletteTokenReferenced) {
		t.Fatalf("referenced token deletion did not fail closed: %v", err)
	}
}

func seededActorID(t *testing.T, db interface {
	QueryRow(query string, args ...any) *sql.Row
}) int64 {
	t.Helper()
	var actorID int64
	if err := db.QueryRow(`SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	return actorID
}

func shadowWriteFromResource(resource TypedSectionResource) ShadowSection {
	key, _ := parseShadowLegacyKey(resource.LegacyKey)
	section := ShadowSection{
		ID: resource.ID, LegacyKey: key, OriginalSectionType: resource.SectionType,
		SectionType: resource.SectionType, DisplayOrder: resource.DisplayOrder,
		Heading: resource.Heading, Subheading: resource.Subheading, ShellVersion: 1,
		Shell: resource.Shell, ConfigVersion: resource.ConfigVersion, Config: resource.Config,
		ConfigEncoding: "string", QuarantinedConfig: map[string]any{},
		QuarantinedSection: map[string]any{}, Revision: resource.Revision,
	}
	for index, itemResource := range resource.Items {
		itemKey, _ := parseShadowLegacyKey(itemResource.LegacyKey)
		section.Items = append(section.Items, ShadowItem{
			ID: itemResource.ID, SourceIndex: index, LegacyKey: itemKey,
			DisplayOrder: itemResource.DisplayOrder, Icon: itemResource.Icon,
			Heading: itemResource.Heading, Subheading: itemResource.Subheading,
			ImageURL: itemResource.ImageURL, LinkURL: itemResource.LinkURL,
			ConfigVersion: 1, Config: itemResource.Config, ConfigEncoding: "string",
			QuarantinedItem: map[string]any{}, Revision: itemResource.Revision,
		})
	}
	return section
}
