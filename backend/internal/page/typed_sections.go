package page

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/skaia/backend/internal/s_registry"
	"github.com/skaia/backend/models"
)

var (
	ErrTypedSectionMutationsDisabled = errors.New("typed section mutations are disabled")
	ErrTypedSectionPolicyDenied      = errors.New("typed section mutation denied")
	ErrTypedSectionInvalid           = errors.New("invalid typed section")
	ErrTypedSectionNotFound          = errors.New("typed section not found")
	ErrPaletteTokenReferenced        = errors.New("palette token is referenced")
	ErrPaletteTokenNotFound          = errors.New("palette token not found")
	ErrLegacySectionMutationDisabled = errors.New("whole-document section mutation is disabled")
)

func sameNormalizedDefinition(left, right string) bool {
	leftDocument, leftErr := NormalizeLegacyPageContent(left)
	rightDocument, rightErr := NormalizeLegacyPageContent(right)
	if leftErr != nil || rightErr != nil {
		return false
	}
	leftHash, leftErr := shadowDocumentHash(leftDocument)
	rightHash, rightErr := shadowDocumentHash(rightDocument)
	return leftErr == nil && rightErr == nil && leftHash == rightHash
}

// TypedSectionRepository is separate from the legacy page repository contract
// so existing tests and non-SQL adapters remain valid during the rollout.
type TypedSectionRepository interface {
	TypedSectionPageReady(pageID int64) (bool, error)
	ListTypedSections(pageID int64) ([]TypedSectionResource, error)
	CreateTypedSection(pageID, actorID int64, section ShadowSection) ([]TypedSectionResource, error)
	UpdateTypedSection(pageID, sectionID, actorID, expectedRevision int64, section ShadowSection) ([]TypedSectionResource, error)
	DeleteTypedSection(pageID, sectionID, actorID, expectedRevision int64) ([]TypedSectionResource, error)
	ReorderTypedSections(pageID, actorID int64, order []TypedSectionOrder) ([]TypedSectionResource, error)
	GetPageTheme(pageID int64) (*models.PageTheme, error)
	UpdatePageTheme(pageID, actorID, expectedRevision int64, theme models.PageTheme) (*models.PageTheme, error)
}

type TypedSectionResource struct {
	ID            int64              `json:"id"`
	LegacyKey     any                `json:"legacy_key"`
	DisplayOrder  int                `json:"display_order"`
	SectionType   string             `json:"section_type"`
	Heading       string             `json:"heading"`
	Subheading    string             `json:"subheading"`
	ShellVersion  int                `json:"shell_version"`
	Shell         ShadowSectionShell `json:"shell"`
	ConfigVersion int                `json:"config_version"`
	Config        map[string]any     `json:"config"`
	Items         []TypedSectionItem `json:"items"`
	Revision      int64              `json:"revision"`
}

type TypedSectionItem struct {
	ID            int64          `json:"id"`
	LegacyKey     any            `json:"legacy_key"`
	DisplayOrder  int            `json:"display_order"`
	Icon          string         `json:"icon"`
	Heading       string         `json:"heading"`
	Subheading    string         `json:"subheading"`
	ImageURL      string         `json:"image_url"`
	LinkURL       string         `json:"link_url"`
	ConfigVersion int            `json:"config_version"`
	Config        map[string]any `json:"config"`
	Revision      int64          `json:"revision"`
}

type TypedSectionWrite struct {
	LegacyKey     any              `json:"legacy_key"`
	DisplayOrder  int              `json:"display_order"`
	SectionType   string           `json:"section_type"`
	Heading       string           `json:"heading"`
	Subheading    string           `json:"subheading"`
	ShellVersion  int              `json:"shell_version"`
	Shell         json.RawMessage  `json:"shell"`
	ConfigVersion int              `json:"config_version"`
	Config        json.RawMessage  `json:"config"`
	Items         []TypedItemWrite `json:"items"`
}

type TypedItemWrite struct {
	LegacyKey     any            `json:"legacy_key"`
	DisplayOrder  int            `json:"display_order"`
	Icon          string         `json:"icon"`
	Heading       string         `json:"heading"`
	Subheading    string         `json:"subheading"`
	ImageURL      string         `json:"image_url"`
	LinkURL       string         `json:"link_url"`
	ConfigVersion int            `json:"config_version"`
	Config        map[string]any `json:"config"`
}

type TypedSectionOrder struct {
	ID               int64 `json:"id"`
	ExpectedRevision int64 `json:"expected_revision"`
}

func (s *Service) TypedSectionMutationsEnabled() bool {
	return s != nil && s.typedSectionMutations && s.typedRepo != nil
}

func (s *Service) requireTypedSectionMutation(pageID, actorID int64) error {
	if !s.TypedSectionMutationsEnabled() {
		return ErrTypedSectionMutationsDisabled
	}
	if s.pageMutationPolicy == nil || s.pageMutationPolicy.RequirePageEditor(pageID, actorID) != nil {
		return ErrTypedSectionPolicyDenied
	}
	ready, err := s.typedRepo.TypedSectionPageReady(pageID)
	if err != nil || !ready {
		return ErrTypedSectionMutationsDisabled
	}
	return nil
}

func (s *Service) ListTypedSections(pageID, actorID int64) ([]TypedSectionResource, error) {
	if err := s.requireTypedSectionMutation(pageID, actorID); err != nil {
		return nil, err
	}
	return s.typedRepo.ListTypedSections(pageID)
}

func (s *Service) CreateTypedSection(pageID, actorID int64, input TypedSectionWrite) ([]TypedSectionResource, error) {
	if err := s.requireTypedSectionMutation(pageID, actorID); err != nil {
		return nil, err
	}
	section, err := s.validateTypedSectionWrite(input)
	if err != nil {
		return nil, err
	}
	sections, err := s.typedRepo.CreateTypedSection(pageID, actorID, section)
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return sections, err
}

func (s *Service) UpdateTypedSection(pageID, sectionID, actorID, expectedRevision int64, input TypedSectionWrite) ([]TypedSectionResource, error) {
	if err := s.requireTypedSectionMutation(pageID, actorID); err != nil {
		return nil, err
	}
	if expectedRevision < 1 {
		return nil, ErrExpectedSectionRevisionRequired
	}
	section, err := s.validateTypedSectionWrite(input)
	if err != nil {
		return nil, err
	}
	sections, err := s.typedRepo.UpdateTypedSection(pageID, sectionID, actorID, expectedRevision, section)
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return sections, err
}

func (s *Service) DeleteTypedSection(pageID, sectionID, actorID, expectedRevision int64) ([]TypedSectionResource, error) {
	if err := s.requireTypedSectionMutation(pageID, actorID); err != nil {
		return nil, err
	}
	if expectedRevision < 1 {
		return nil, ErrExpectedSectionRevisionRequired
	}
	sections, err := s.typedRepo.DeleteTypedSection(pageID, sectionID, actorID, expectedRevision)
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return sections, err
}

func (s *Service) ReorderTypedSections(pageID, actorID int64, order []TypedSectionOrder) ([]TypedSectionResource, error) {
	if err := s.requireTypedSectionMutation(pageID, actorID); err != nil {
		return nil, err
	}
	if len(order) > maxShadowSections {
		return nil, ErrTypedSectionInvalid
	}
	sections, err := s.typedRepo.ReorderTypedSections(pageID, actorID, order)
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return sections, err
}

func (s *Service) UpdatePageTheme(pageID, actorID, expectedRevision int64, theme models.PageTheme) (*models.PageTheme, error) {
	if err := s.requireTypedSectionMutation(pageID, actorID); err != nil {
		return nil, err
	}
	if expectedRevision < 1 {
		return nil, ErrExpectedSectionRevisionRequired
	}
	theme.Version = 1
	theme.Revision = expectedRevision
	raw, err := json.Marshal(theme)
	if err != nil {
		return nil, ErrTypedSectionInvalid
	}
	var value map[string]any
	if json.Unmarshal(raw, &value) != nil || s_registry.ValidateContractValue(s_registry.PageThemeV1, value) != nil {
		return nil, ErrTypedSectionInvalid
	}
	updated, err := s.typedRepo.UpdatePageTheme(pageID, actorID, expectedRevision, theme)
	if err == nil {
		s.invalidateSEOByID(pageID)
	}
	return updated, err
}

func (s *Service) validateTypedSectionWrite(input TypedSectionWrite) (ShadowSection, error) {
	legacyKey, ok := parseShadowLegacyKey(input.LegacyKey)
	if !ok || input.DisplayOrder < 0 || input.ShellVersion != 1 || input.ConfigVersion != 1 ||
		!s_registry.IsSupported(input.SectionType) || len(input.Heading) > 10000 || len(input.Subheading) > 20000 ||
		len(input.Items) > maxShadowItems {
		return ShadowSection{}, ErrTypedSectionInvalid
	}

	var shellValue map[string]any
	if len(input.Shell) == 0 || json.Unmarshal(input.Shell, &shellValue) != nil || shellValue == nil ||
		s_registry.ValidateContractValue(s_registry.SharedSectionShellV1, shellValue) != nil {
		return ShadowSection{}, ErrTypedSectionInvalid
	}
	var shell ShadowSectionShell
	if json.Unmarshal(input.Shell, &shell) != nil {
		return ShadowSection{}, ErrTypedSectionInvalid
	}

	sectionType := s_registry.NormalizedSectionType(input.SectionType)
	if _, err := s_registry.DecodeNormalizedSectionConfig(sectionType, input.Config); err != nil {
		return ShadowSection{}, fmt.Errorf("%w: config rejected", ErrTypedSectionInvalid)
	}
	var config map[string]any
	if json.Unmarshal(input.Config, &config) != nil || config == nil {
		return ShadowSection{}, ErrTypedSectionInvalid
	}
	if err := s.validateTypedIntegration(input.SectionType, config); err != nil {
		return ShadowSection{}, err
	}

	section := ShadowSection{
		LegacyKey: legacyKey, OriginalSectionType: input.SectionType, SectionType: input.SectionType,
		DisplayOrder: input.DisplayOrder, Heading: input.Heading, Subheading: input.Subheading,
		ShellVersion: 1, Shell: shell, ConfigVersion: 1, Config: config, ConfigEncoding: "string",
		QuarantinedConfig: map[string]any{}, QuarantinedSection: map[string]any{}, Revision: 1,
	}
	seen := map[string]struct{}{}
	for index, itemInput := range input.Items {
		itemKey, ok := parseShadowLegacyKey(itemInput.LegacyKey)
		key := itemKey.Kind + "\x00" + itemKey.Value
		if !ok || itemInput.DisplayOrder < 0 || itemInput.ConfigVersion != 1 || itemInput.Config == nil ||
			len(itemInput.Icon) > 120 || len(itemInput.Heading) > 1000 || len(itemInput.Subheading) > 5000 ||
			len(itemInput.ImageURL) > 4096 || len(itemInput.LinkURL) > 4096 {
			return ShadowSection{}, ErrTypedSectionInvalid
		}
		if _, duplicate := seen[key]; duplicate {
			return ShadowSection{}, ErrTypedSectionInvalid
		}
		seen[key] = struct{}{}
		contractValue := map[string]any{
			"id": 1, "section_id": 1, "legacy_key": projectLegacyKey(itemKey),
			"display_order": itemInput.DisplayOrder, "icon": itemInput.Icon, "heading": itemInput.Heading,
			"subheading": itemInput.Subheading, "image_url": itemInput.ImageURL, "link_url": itemInput.LinkURL,
			"config_version": 1, "config": itemInput.Config, "revision": 1,
		}
		if s_registry.ValidateContractValue(s_registry.PageItemV1, contractValue) != nil {
			return ShadowSection{}, ErrTypedSectionInvalid
		}
		section.Items = append(section.Items, ShadowItem{
			SourceIndex: index, LegacyKey: itemKey, DisplayOrder: itemInput.DisplayOrder,
			Icon: itemInput.Icon, Heading: itemInput.Heading, Subheading: itemInput.Subheading,
			ImageURL: itemInput.ImageURL, LinkURL: itemInput.LinkURL, ConfigVersion: 1,
			Config: itemInput.Config, ConfigEncoding: "string", QuarantinedItem: map[string]any{}, Revision: 1,
		})
	}
	return section, nil
}

func (s *Service) validateTypedIntegration(sectionType string, config map[string]any) error {
	positiveID := func(key string) int64 {
		value, _ := config[key].(float64)
		return int64(value)
	}
	switch sectionType {
	case "derived_section":
		id := positiveID("datasource_id")
		if id > 0 && s.contentResolver != nil {
			exists, err := s.contentResolver.DataSourceExists(id)
			if err != nil || !exists {
				return fmt.Errorf("%w: datasource reference rejected", ErrTypedSectionInvalid)
			}
		}
	case "custom_section":
		if id := positiveID("datasource_id"); id > 0 && s.contentResolver != nil {
			exists, err := s.contentResolver.DataSourceExists(id)
			if err != nil || !exists {
				return fmt.Errorf("%w: datasource reference rejected", ErrTypedSectionInvalid)
			}
		}
		if id := positiveID("custom_section_id"); id > 0 && s.contentResolver != nil {
			exists, err := s.contentResolver.CustomSectionExists(id)
			if err != nil || !exists {
				return fmt.Errorf("%w: custom section reference rejected", ErrTypedSectionInvalid)
			}
		}
	}
	return nil
}

func typedSectionResources(document NormalizedShadowDocument) []TypedSectionResource {
	resources := make([]TypedSectionResource, 0, len(document.Sections))
	for _, section := range document.Sections {
		resource := TypedSectionResource{
			ID: section.ID, LegacyKey: projectLegacyKey(section.LegacyKey), DisplayOrder: section.DisplayOrder,
			SectionType: section.SectionType, Heading: section.Heading, Subheading: section.Subheading,
			ShellVersion: 1, Shell: section.Shell, ConfigVersion: section.ConfigVersion,
			Config: cloneMap(section.Config), Revision: section.Revision, Items: []TypedSectionItem{},
		}
		for _, item := range section.Items {
			resource.Items = append(resource.Items, TypedSectionItem{
				ID: item.ID, LegacyKey: projectLegacyKey(item.LegacyKey), DisplayOrder: item.DisplayOrder,
				Icon: item.Icon, Heading: item.Heading, Subheading: item.Subheading, ImageURL: item.ImageURL,
				LinkURL: item.LinkURL, ConfigVersion: item.ConfigVersion, Config: cloneMap(item.Config), Revision: item.Revision,
			})
		}
		resources = append(resources, resource)
	}
	return resources
}

func sanitizedTypedError(err error) error {
	if err == nil || errors.Is(err, ErrTypedSectionInvalid) || errors.Is(err, ErrTypedSectionNotFound) ||
		errors.Is(err, ErrExpectedSectionRevisionRequired) || errors.Is(err, ErrSectionRevisionConflict) ||
		errors.Is(err, ErrPaletteTokenReferenced) || errors.Is(err, ErrPaletteTokenNotFound) {
		return err
	}
	if strings.Contains(err.Error(), "page_section_instances") {
		return ErrTypedSectionInvalid
	}
	return err
}
