package page

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/skaia/backend/internal/s_registry"
	"github.com/skaia/backend/models"
)

type typedPolicyStub struct{ err error }

func (p typedPolicyStub) RequirePageEditor(pageID, actorID int64) error { return p.err }

type typedRepositoryStub struct{ ready bool }

func (r typedRepositoryStub) TypedSectionPageReady(int64) (bool, error)             { return r.ready, nil }
func (typedRepositoryStub) ListTypedSections(int64) ([]TypedSectionResource, error) { return nil, nil }
func (typedRepositoryStub) CreateTypedSection(int64, int64, ShadowSection) ([]TypedSectionResource, error) {
	return nil, nil
}
func (typedRepositoryStub) UpdateTypedSection(int64, int64, int64, int64, ShadowSection) ([]TypedSectionResource, error) {
	return nil, nil
}
func (typedRepositoryStub) DeleteTypedSection(int64, int64, int64, int64) ([]TypedSectionResource, error) {
	return nil, nil
}
func (typedRepositoryStub) ReorderTypedSections(int64, int64, []TypedSectionOrder) ([]TypedSectionResource, error) {
	return nil, nil
}
func (typedRepositoryStub) GetPageTheme(int64) (*models.PageTheme, error) { return nil, nil }
func (typedRepositoryStub) UpdatePageTheme(int64, int64, int64, models.PageTheme) (*models.PageTheme, error) {
	return nil, nil
}

func validTypedWrite(t *testing.T, sectionType string) TypedSectionWrite {
	t.Helper()
	shell, err := defaultShadowShell()
	if err != nil {
		t.Fatal(err)
	}
	shellRaw, _ := json.Marshal(shell)
	definition, ok := s_registry.Get(sectionType)
	if !ok {
		t.Fatalf("missing registry definition %s", sectionType)
	}
	return TypedSectionWrite{
		LegacyKey: json.Number("10"), DisplayOrder: 1, SectionType: sectionType,
		Heading: "Heading", ShellVersion: 1, Shell: shellRaw,
		ConfigVersion: 1, Config: definition.DefaultConfig, Items: []TypedItemWrite{},
	}
}

func TestTypedMutationPolicyAndReadinessFailClosed(t *testing.T) {
	service := &Service{
		typedRepo: typedRepositoryStub{ready: true}, typedSectionMutations: true,
		pageMutationPolicy: typedPolicyStub{err: errors.New("denied")},
	}
	if _, err := service.CreateTypedSection(1, 2, validTypedWrite(t, "hero")); !errors.Is(err, ErrTypedSectionPolicyDenied) {
		t.Fatalf("policy denial did not fail closed: %v", err)
	}
	service.pageMutationPolicy = typedPolicyStub{}
	service.typedRepo = typedRepositoryStub{ready: false}
	if _, err := service.CreateTypedSection(1, 2, validTypedWrite(t, "hero")); !errors.Is(err, ErrTypedSectionMutationsDisabled) {
		t.Fatalf("unready shadow did not fail closed: %v", err)
	}
}

func TestTypedWriteUsesStrictGeneratedConfigAndShellContracts(t *testing.T) {
	service := &Service{}
	valid := validTypedWrite(t, "hero")
	if _, err := service.validateTypedSectionWrite(valid); err != nil {
		t.Fatalf("valid typed write rejected: %v", err)
	}
	invalidConfig := valid
	invalidConfig.Config = json.RawMessage(`{"variant":1,"variant":2}`)
	if _, err := service.validateTypedSectionWrite(invalidConfig); !errors.Is(err, ErrTypedSectionInvalid) {
		t.Fatalf("duplicate config keys were accepted: %v", err)
	}
	invalidShell := valid
	invalidShell.Shell = json.RawMessage(`{"layout":"center"}`)
	if _, err := service.validateTypedSectionWrite(invalidShell); !errors.Is(err, ErrTypedSectionInvalid) {
		t.Fatalf("incomplete shell was accepted: %v", err)
	}
}

func TestDefinitionComparisonIgnoresInteractiveRuntimeOnly(t *testing.T) {
	left := `[{"id":1,"display_order":1,"section_type":"poll","heading":"Poll","subheading":"","config":{"status":"open","submit_label":"Vote","success_text":"Done","result_visibility":"never","response_limit":1,"fields":[],"records":[{"id":"secret"}]}}]`
	right := `[{"id":1,"display_order":1,"section_type":"poll","heading":"Poll","subheading":"","config":{"status":"open","submit_label":"Vote","success_text":"Done","result_visibility":"never","response_limit":1,"fields":[],"records":[]}}]`
	if !sameNormalizedDefinition(left, right) {
		t.Fatal("runtime-only changes altered the normalized definition comparison")
	}
	changed := `[{"id":1,"display_order":1,"section_type":"poll","heading":"Changed","subheading":"","config":{"status":"open","submit_label":"Vote","success_text":"Done","result_visibility":"never","response_limit":1,"fields":[]}}]`
	if sameNormalizedDefinition(left, changed) {
		t.Fatal("definition mutation bypassed typed-only comparison")
	}
}
