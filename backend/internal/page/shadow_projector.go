package page

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/skaia/backend/internal/s_registry"
)

const (
	maxShadowSections = 1000
	maxShadowItems    = 5000
)

// ShadowLegacyKey preserves whether an old page-scoped key was a JSON number
// or string. The textual value is never treated as a globally unique ID.
type ShadowLegacyKey struct {
	Kind  string `json:"kind"`
	Value string `json:"value"`
}

type ShadowColorSource struct {
	Mode  string `json:"mode"`
	Token string `json:"token,omitempty"`
	Value string `json:"value,omitempty"`
}

type ShadowSectionShell struct {
	Layout             string            `json:"layout"`
	ContainerWidth     string            `json:"container_width"`
	MarginTop          float64           `json:"margin_top"`
	MarginRight        float64           `json:"margin_right"`
	MarginBottom       float64           `json:"margin_bottom"`
	MarginLeft         float64           `json:"margin_left"`
	PaddingTop         float64           `json:"padding_top"`
	PaddingRight       float64           `json:"padding_right"`
	PaddingBottom      float64           `json:"padding_bottom"`
	PaddingLeft        float64           `json:"padding_left"`
	Animation          string            `json:"animation"`
	AnimationIntensity string            `json:"animation_intensity"`
	BackgroundColor    ShadowColorSource `json:"background_color"`
	TextColor          ShadowColorSource `json:"text_color"`
	H1Color            ShadowColorSource `json:"h1_color"`
	H2Color            ShadowColorSource `json:"h2_color"`
	H3Color            ShadowColorSource `json:"h3_color"`
	ContentScale       float64           `json:"content_scale"`
	Collapsible        bool              `json:"collapsible"`
	DefaultCollapsed   bool              `json:"default_collapsed"`
}

type ShadowItem struct {
	ID              int64           `json:"-"`
	SourceIndex     int             `json:"source_index"`
	LegacyKey       ShadowLegacyKey `json:"legacy_key"`
	DisplayOrder    int             `json:"display_order"`
	Icon            string          `json:"icon"`
	Heading         string          `json:"heading"`
	Subheading      string          `json:"subheading"`
	ImageURL        string          `json:"image_url"`
	LinkURL         string          `json:"link_url"`
	ConfigVersion   int             `json:"config_version"`
	Config          map[string]any  `json:"config"`
	ConfigEncoding  string          `json:"config_encoding"`
	QuarantinedItem map[string]any  `json:"quarantined_item"`
	Revision        int64           `json:"revision"`
}

type ShadowSection struct {
	ID                  int64              `json:"-"`
	SourceIndex         int                `json:"source_index"`
	LegacyKey           ShadowLegacyKey    `json:"legacy_key"`
	OriginalSectionType string             `json:"original_section_type"`
	SectionType         string             `json:"section_type"`
	DisplayOrder        int                `json:"display_order"`
	Heading             string             `json:"heading"`
	Subheading          string             `json:"subheading"`
	ShellVersion        int                `json:"shell_version"`
	Shell               ShadowSectionShell `json:"shell"`
	ConfigVersion       int                `json:"config_version"`
	Config              map[string]any     `json:"config"`
	ConfigEncoding      string             `json:"config_encoding"`
	QuarantinedConfig   map[string]any     `json:"quarantined_config"`
	QuarantinedSection  map[string]any     `json:"quarantined_section"`
	AliasRepairs        []string           `json:"alias_repairs"`
	Revision            int64              `json:"revision"`
	Items               []ShadowItem       `json:"items"`
}

type ShadowQuarantine struct {
	SourceIndex int              `json:"source_index"`
	LegacyKey   *ShadowLegacyKey `json:"legacy_key,omitempty"`
	ReasonCode  string           `json:"reason_code"`
	SafePayload map[string]any   `json:"safe_payload"`
}

type NormalizedShadowDocument struct {
	Sections       []ShadowSection    `json:"sections"`
	Quarantine     []ShadowQuarantine `json:"quarantine"`
	AliasRepairs   []string           `json:"alias_repairs"`
	DefaultRepairs []string           `json:"default_repairs"`
}

var (
	shadowContractOnce sync.Once
	shadowDefaultShell ShadowSectionShell
	shadowContractErr  error
	configKeysOnce     sync.Once
	configKeysByType   map[string]map[string]struct{}
)

var shellAliases = map[string]string{
	"layout": "layout", "wide": "layout", "container_width": "container_width", "containerWidth": "container_width",
	"margin_top": "margin_top", "marginTop": "margin_top", "margin_right": "margin_right", "marginRight": "margin_right",
	"margin_bottom": "margin_bottom", "marginBottom": "margin_bottom", "margin_left": "margin_left", "marginLeft": "margin_left",
	"padding": "padding", "padding_top": "padding_top", "paddingTop": "padding_top", "padding_right": "padding_right",
	"paddingRight": "padding_right", "padding_bottom": "padding_bottom", "paddingBottom": "padding_bottom",
	"padding_left": "padding_left", "paddingLeft": "padding_left", "animation": "animation",
	"animation_intensity": "animation_intensity", "animationIntensity": "animation_intensity",
	"background_color": "background_color", "bg_color": "background_color", "text_color": "text_color",
	"h1_color": "h1_color", "h2_color": "h2_color", "h3_color": "h3_color", "content_scale": "content_scale",
	"contentScale": "content_scale", "collapsible": "collapsible", "default_collapsed": "default_collapsed",
	"defaultCollapsed": "default_collapsed",
}

var knownSectionFields = map[string]struct{}{
	"id": {}, "display_order": {}, "section_type": {}, "heading": {}, "subheading": {}, "config": {}, "items": {},
	"last_edited_by": {}, "revision": {},
}

var knownItemFields = map[string]struct{}{
	"id": {}, "section_id": {}, "display_order": {}, "icon": {}, "heading": {}, "subheading": {}, "image_url": {},
	"link_url": {}, "config": {}, "revision": {},
}

func defaultShadowShell() (ShadowSectionShell, error) {
	shadowContractOnce.Do(func() {
		raw := s_registry.ContractSchemas()[s_registry.SharedSectionShellV1]
		var schema struct {
			Default json.RawMessage `json:"default"`
		}
		if err := json.Unmarshal(raw, &schema); err != nil {
			shadowContractErr = err
			return
		}
		shadowContractErr = json.Unmarshal(schema.Default, &shadowDefaultShell)
	})
	return shadowDefaultShell, shadowContractErr
}

func sectionConfigKeys() map[string]map[string]struct{} {
	configKeysOnce.Do(func() {
		configKeysByType = make(map[string]map[string]struct{}, len(s_registry.SectionTypes()))
		for _, sectionType := range s_registry.SectionTypes() {
			definition, _ := s_registry.Get(sectionType)
			var schema struct {
				Properties map[string]json.RawMessage `json:"properties"`
			}
			_ = json.Unmarshal(definition.ConfigSchema, &schema)
			keys := make(map[string]struct{}, len(schema.Properties))
			for key := range schema.Properties {
				keys[key] = struct{}{}
			}
			configKeysByType[sectionType] = keys
		}
	})
	return configKeysByType
}

// NormalizeLegacyPageContent converts the current pages.content envelope into
// a response-free normalized shadow document. Invalid/unsupported inputs are
// represented by structural quarantine metadata while pages.content remains the
// authoritative lossless copy.
func NormalizeLegacyPageContent(content string) (NormalizedShadowDocument, error) {
	var result NormalizedShadowDocument
	decoder := json.NewDecoder(strings.NewReader(content))
	decoder.UseNumber()
	var sections []map[string]any
	if err := decoder.Decode(&sections); err != nil {
		return result, fmt.Errorf("decode page section shadow source: %w", err)
	}
	if err := ensureShadowEOF(decoder); err != nil {
		return result, err
	}
	if len(sections) > maxShadowSections {
		return result, fmt.Errorf("page section shadow source exceeds %d sections", maxShadowSections)
	}

	seenKeys := make(map[string]struct{}, len(sections))
	itemCount := 0
	for index, raw := range sections {
		section, quarantine, aliases, defaults := normalizeLegacySection(raw, index)
		result.AliasRepairs = append(result.AliasRepairs, aliases...)
		result.DefaultRepairs = append(result.DefaultRepairs, defaults...)
		if quarantine != nil {
			result.Quarantine = append(result.Quarantine, *quarantine)
			continue
		}
		key := section.LegacyKey.Kind + "\x00" + section.LegacyKey.Value
		if _, duplicate := seenKeys[key]; duplicate {
			result.Quarantine = append(result.Quarantine, ShadowQuarantine{
				SourceIndex: index, LegacyKey: &section.LegacyKey, ReasonCode: "duplicate_section_legacy_key",
				SafePayload: map[string]any{"section_type": section.OriginalSectionType},
			})
			continue
		}
		seenKeys[key] = struct{}{}
		itemCount += len(section.Items)
		if itemCount > maxShadowItems {
			return result, fmt.Errorf("page section shadow source exceeds %d items", maxShadowItems)
		}
		result.Sections = append(result.Sections, section)
	}
	return result, nil
}

func normalizeLegacySection(raw map[string]any, index int) (ShadowSection, *ShadowQuarantine, []string, []string) {
	var section ShadowSection
	section.SourceIndex = index
	key, ok := parseShadowLegacyKey(raw["id"])
	if !ok {
		return section, &ShadowQuarantine{SourceIndex: index, ReasonCode: "invalid_section_legacy_key", SafePayload: structuralPayload(raw)}, nil, nil
	}
	section.LegacyKey = key
	originalType, _ := raw["section_type"].(string)
	sectionType := originalType
	aliases := []string{}
	if originalType == "features" {
		sectionType = "feature_grid"
		aliases = append(aliases, fmt.Sprintf("section[%d]:features:feature_grid", index))
	}
	if !s_registry.IsSupported(sectionType) {
		return section, &ShadowQuarantine{
			SourceIndex: index, LegacyKey: &key, ReasonCode: "unsupported_section_type",
			SafePayload: map[string]any{"section_type": originalType},
		}, aliases, nil
	}

	config, encoding, err := decodeShadowConfig(raw["config"])
	if err != nil {
		return section, &ShadowQuarantine{
			SourceIndex: index, LegacyKey: &key, ReasonCode: "invalid_section_config",
			SafePayload: map[string]any{"section_type": originalType},
		}, aliases, nil
	}
	section.OriginalSectionType = originalType
	section.SectionType = sectionType
	section.DisplayOrder, _ = nonNegativeInt(raw["display_order"], index)
	section.Heading, _ = raw["heading"].(string)
	section.Subheading, _ = raw["subheading"].(string)
	section.ShellVersion = 1
	section.ConfigVersion = 1
	section.ConfigEncoding = encoding
	section.Revision = positiveInt64(raw["revision"], 1)
	section.QuarantinedConfig = map[string]any{}
	section.QuarantinedSection = map[string]any{}
	section.AliasRepairs = aliases
	for field, value := range raw {
		if _, known := knownSectionFields[field]; !known {
			section.QuarantinedSection[field] = value
		}
	}

	shell, shellQuarantine, shellDefaults := normalizeShadowShell(config, index)
	section.Shell = shell
	for key, value := range shellQuarantine {
		section.QuarantinedConfig[key] = value
	}

	definition, _ := s_registry.Get(sectionType)
	var specific map[string]any
	_ = decodeJSONValue(definition.DefaultConfig, &specific)
	keys := sectionConfigKeys()[sectionType]
	for field, value := range config {
		if _, isShell := shellAliases[field]; isShell {
			continue
		}
		if field == "records" || field == "result_summary" {
			continue // sensitive/runtime values never enter the normalized definition contract.
		}
		if _, known := keys[field]; known {
			specific[field] = value
			continue
		}
		if sectionType == "hero" && field == "video_url" {
			if video, ok := value.(string); ok {
				if videos, exists := specific["videos"].([]any); !exists || len(videos) == 0 {
					specific["videos"] = []any{video}
				}
				aliases = append(aliases, fmt.Sprintf("section[%d]:video_url:videos", index))
			}
		}
		section.QuarantinedConfig[field] = value
	}
	section.AliasRepairs = aliases
	// Contract validation operates on ordinary decoded JSON values. The source
	// decoder uses json.Number to preserve legacy identities, so canonicalize the
	// section-specific object before validating numeric config fields.
	if rawSpecific, err := json.Marshal(specific); err == nil {
		var canonicalSpecific map[string]any
		if json.Unmarshal(rawSpecific, &canonicalSpecific) == nil {
			specific = canonicalSpecific
		}
	}

	if err := s_registry.ValidateNormalizedSectionConfig(sectionType, specific); err != nil {
		for field, value := range specific {
			section.QuarantinedConfig[field] = value
		}
		_ = decodeJSONValue(definition.DefaultConfig, &specific)
		shellDefaults = append(shellDefaults, fmt.Sprintf("section[%d]:invalid_config:default", index))
	}
	section.Config = specific

	items, _ := raw["items"].([]any)
	seenItemKeys := map[string]struct{}{}
	for itemIndex, value := range items {
		itemMap, ok := value.(map[string]any)
		if !ok {
			shellDefaults = append(shellDefaults, fmt.Sprintf("section[%d].item[%d]:invalid:omitted", index, itemIndex))
			continue
		}
		item, ok := normalizeShadowItem(itemMap, itemIndex)
		if !ok {
			shellDefaults = append(shellDefaults, fmt.Sprintf("section[%d].item[%d]:invalid:omitted", index, itemIndex))
			continue
		}
		itemKey := item.LegacyKey.Kind + "\x00" + item.LegacyKey.Value
		if _, duplicate := seenItemKeys[itemKey]; duplicate {
			shellDefaults = append(shellDefaults, fmt.Sprintf("section[%d].item[%d]:duplicate:omitted", index, itemIndex))
			continue
		}
		seenItemKeys[itemKey] = struct{}{}
		section.Items = append(section.Items, item)
	}
	return section, nil, aliases, shellDefaults
}

func normalizeShadowItem(raw map[string]any, index int) (ShadowItem, bool) {
	key, ok := parseShadowLegacyKey(raw["id"])
	if !ok {
		return ShadowItem{}, false
	}
	config, encoding, err := decodeShadowConfig(raw["config"])
	if err != nil {
		return ShadowItem{}, false
	}
	item := ShadowItem{
		SourceIndex: index, LegacyKey: key, ConfigVersion: 1, Config: config,
		ConfigEncoding: encoding, Revision: positiveInt64(raw["revision"], 1), QuarantinedItem: map[string]any{},
	}
	item.DisplayOrder, _ = nonNegativeInt(raw["display_order"], index)
	item.Icon, _ = raw["icon"].(string)
	item.Heading, _ = raw["heading"].(string)
	item.Subheading, _ = raw["subheading"].(string)
	item.ImageURL, _ = raw["image_url"].(string)
	item.LinkURL, _ = raw["link_url"].(string)
	for field, value := range raw {
		if _, known := knownItemFields[field]; !known {
			item.QuarantinedItem[field] = value
		}
	}
	return item, true
}

func normalizeShadowShell(config map[string]any, sectionIndex int) (ShadowSectionShell, map[string]any, []string) {
	shell, err := defaultShadowShell()
	if err != nil {
		return ShadowSectionShell{}, map[string]any{}, []string{fmt.Sprintf("section[%d]:shell_default_error", sectionIndex)}
	}
	quarantine := map[string]any{}
	repairs := []string{}
	setNumber := func(canonical string, minimum, maximum float64, target *float64) {
		value, source, found := shadowAliasValue(config, canonical)
		if !found {
			return
		}
		if number, ok := finiteNumber(value); ok && number >= minimum && number <= maximum {
			*target = number
			if source != canonical {
				repairs = append(repairs, fmt.Sprintf("section[%d]:%s:%s", sectionIndex, source, canonical))
			}
			return
		}
		quarantine[source] = value
	}
	if layout, ok := config["layout"].(string); ok && oneOf(layout, "left", "center", "right", "wide") {
		shell.Layout = layout
	} else if wide, ok := config["wide"].(bool); ok && wide {
		shell.Layout = "wide"
		repairs = append(repairs, fmt.Sprintf("section[%d]:wide:layout", sectionIndex))
	} else if value, exists := config["layout"]; exists {
		quarantine["layout"] = value
	}
	if value, source, found := shadowAliasValue(config, "container_width"); found {
		if width, ok := value.(string); ok && oneOf(width, "narrow", "content", "wide", "full") {
			shell.ContainerWidth = width
			if source != "container_width" {
				repairs = append(repairs, fmt.Sprintf("section[%d]:%s:container_width", sectionIndex, source))
			}
		} else {
			quarantine[source] = value
		}
	}
	setNumber("margin_top", -512, 512, &shell.MarginTop)
	setNumber("margin_right", -512, 512, &shell.MarginRight)
	setNumber("margin_bottom", -512, 512, &shell.MarginBottom)
	setNumber("margin_left", -512, 512, &shell.MarginLeft)
	if padding, ok := finiteNumber(config["padding"]); ok && padding >= 0 && padding <= 512 {
		shell.PaddingTop, shell.PaddingRight, shell.PaddingBottom, shell.PaddingLeft = padding, padding, padding, padding
		repairs = append(repairs, fmt.Sprintf("section[%d]:padding:padding_sides", sectionIndex))
	}
	setNumber("padding_top", 0, 512, &shell.PaddingTop)
	setNumber("padding_right", 0, 512, &shell.PaddingRight)
	setNumber("padding_bottom", 0, 512, &shell.PaddingBottom)
	setNumber("padding_left", 0, 512, &shell.PaddingLeft)
	if value, ok := config["animation"].(string); ok && oneOf(value, "none", "fade-in", "slide-up", "slide-left", "slide-right", "zoom-in", "bounce") {
		shell.Animation = value
	} else if value, exists := config["animation"]; exists {
		quarantine["animation"] = value
	}
	if value, source, found := shadowAliasValue(config, "animation_intensity"); found {
		if intensity, ok := value.(string); ok && oneOf(intensity, "subtle", "normal", "dramatic") {
			shell.AnimationIntensity = intensity
			if source != "animation_intensity" {
				repairs = append(repairs, fmt.Sprintf("section[%d]:%s:animation_intensity", sectionIndex, source))
			}
		} else {
			quarantine[source] = value
		}
	}

	colorTargets := map[string]*ShadowColorSource{
		"background_color": &shell.BackgroundColor, "text_color": &shell.TextColor, "h1_color": &shell.H1Color,
		"h2_color": &shell.H2Color, "h3_color": &shell.H3Color,
	}
	for canonical, target := range colorTargets {
		value, source, found := shadowAliasValue(config, canonical)
		if !found {
			continue
		}
		candidate, ok := parseShadowColor(value)
		if ok && validShadowColor(canonical, candidate, shell) {
			*target = candidate
			if source != canonical {
				repairs = append(repairs, fmt.Sprintf("section[%d]:%s:%s", sectionIndex, source, canonical))
			}
		} else {
			quarantine[source] = value
		}
	}
	setNumber("content_scale", 0.5, 2, &shell.ContentScale)
	if value, ok := config["collapsible"].(bool); ok {
		shell.Collapsible = value
	} else if value, exists := config["collapsible"]; exists {
		quarantine["collapsible"] = value
	}
	if value, source, found := shadowAliasValue(config, "default_collapsed"); found {
		if collapsed, ok := value.(bool); ok {
			shell.DefaultCollapsed = collapsed
			if source != "default_collapsed" {
				repairs = append(repairs, fmt.Sprintf("section[%d]:%s:default_collapsed", sectionIndex, source))
			}
		} else {
			quarantine[source] = value
		}
	}
	return shell, quarantine, repairs
}

func validShadowColor(field string, source ShadowColorSource, shell ShadowSectionShell) bool {
	candidate := shell
	switch field {
	case "background_color":
		candidate.BackgroundColor = source
	case "text_color":
		candidate.TextColor = source
	case "h1_color":
		candidate.H1Color = source
	case "h2_color":
		candidate.H2Color = source
	case "h3_color":
		candidate.H3Color = source
	}
	var value map[string]any
	raw, _ := json.Marshal(candidate)
	_ = decodeJSONValue(raw, &value)
	return s_registry.ValidateContractValue(s_registry.SharedSectionShellV1, value) == nil
}

func parseShadowColor(value any) (ShadowColorSource, bool) {
	if text, ok := value.(string); ok {
		if text == "" {
			return ShadowColorSource{Mode: "inherit"}, true
		}
		return ShadowColorSource{Mode: "literal", Value: text}, true
	}
	object, ok := value.(map[string]any)
	if !ok {
		return ShadowColorSource{}, false
	}
	mode, _ := object["mode"].(string)
	switch mode {
	case "inherit":
		return ShadowColorSource{Mode: mode}, true
	case "palette":
		token, ok := object["token"].(string)
		return ShadowColorSource{Mode: mode, Token: token}, ok
	case "literal":
		literal, ok := object["value"].(string)
		return ShadowColorSource{Mode: mode, Value: literal}, ok
	default:
		return ShadowColorSource{}, false
	}
}

// ProjectNormalizedPageContent reconstructs the non-sensitive legacy document
// shape from normalized definition rows. The response authority appends only its
// separately controlled rollback projection.
func ProjectNormalizedPageContent(document NormalizedShadowDocument) (string, error) {
	sections := append([]ShadowSection(nil), document.Sections...)
	sort.SliceStable(sections, func(i, j int) bool { return sections[i].SourceIndex < sections[j].SourceIndex })
	result := make([]map[string]any, 0, len(sections))
	for _, section := range sections {
		config := cloneMap(section.Config)
		projectShell(config, section.Shell)
		// Quarantined values remain available for a lossless compatibility
		// projection. They intentionally win over normalized defaults, while the
		// authoritative legacy document remains the read source in shadow mode.
		for key, value := range section.QuarantinedConfig {
			config[key] = value
		}
		items := append([]ShadowItem(nil), section.Items...)
		sort.SliceStable(items, func(i, j int) bool { return items[i].SourceIndex < items[j].SourceIndex })
		projectedItems := make([]map[string]any, 0, len(items))
		for _, item := range items {
			projected := cloneMap(item.QuarantinedItem)
			projected["id"] = projectLegacyKey(item.LegacyKey)
			projected["section_id"] = projectLegacyKey(section.LegacyKey)
			projected["display_order"] = item.DisplayOrder
			projected["icon"] = item.Icon
			projected["heading"] = item.Heading
			projected["subheading"] = item.Subheading
			projected["image_url"] = item.ImageURL
			projected["link_url"] = item.LinkURL
			projected["config"] = encodeLegacyConfig(item.Config, item.ConfigEncoding)
			if item.Revision > 1 {
				projected["revision"] = item.Revision
			}
			projectedItems = append(projectedItems, projected)
		}
		projected := cloneMap(section.QuarantinedSection)
		projected["id"] = projectLegacyKey(section.LegacyKey)
		projected["display_order"] = section.DisplayOrder
		projected["section_type"] = section.OriginalSectionType
		projected["heading"] = section.Heading
		projected["subheading"] = section.Subheading
		projected["config"] = encodeLegacyConfig(config, section.ConfigEncoding)
		if len(projectedItems) > 0 {
			projected["items"] = projectedItems
		}
		if section.Revision > 1 {
			projected["revision"] = section.Revision
		}
		result = append(result, projected)
	}
	raw, err := json.Marshal(result)
	return string(raw), err
}

func projectShell(config map[string]any, shell ShadowSectionShell) {
	config["layout"] = shell.Layout
	config["container_width"] = shell.ContainerWidth
	config["marginTop"] = shell.MarginTop
	config["marginRight"] = shell.MarginRight
	config["marginBottom"] = shell.MarginBottom
	config["marginLeft"] = shell.MarginLeft
	config["paddingTop"] = shell.PaddingTop
	config["paddingRight"] = shell.PaddingRight
	config["paddingBottom"] = shell.PaddingBottom
	config["paddingLeft"] = shell.PaddingLeft
	config["animation"] = shell.Animation
	config["animationIntensity"] = shell.AnimationIntensity
	config["background_color"] = shell.BackgroundColor
	if shell.BackgroundColor.Mode == "literal" {
		config["bg_color"] = shell.BackgroundColor.Value
	}
	config["text_color"] = shell.TextColor
	config["h1_color"] = shell.H1Color
	config["h2_color"] = shell.H2Color
	config["h3_color"] = shell.H3Color
	config["content_scale"] = shell.ContentScale
	config["collapsible"] = shell.Collapsible
	config["default_collapsed"] = shell.DefaultCollapsed
}

func shadowDocumentHash(document NormalizedShadowDocument) (string, error) {
	document.Quarantine = nil
	document.AliasRepairs = nil
	document.DefaultRepairs = nil
	for index := range document.Sections {
		document.Sections[index].AliasRepairs = nil
	}
	raw, err := json.Marshal(document)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}

func parseShadowLegacyKey(value any) (ShadowLegacyKey, bool) {
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return ShadowLegacyKey{}, false
		}
		return ShadowLegacyKey{Kind: "string", Value: typed}, true
	case json.Number:
		if _, err := strconv.ParseInt(string(typed), 10, 64); err != nil {
			return ShadowLegacyKey{}, false
		}
		return ShadowLegacyKey{Kind: "number", Value: string(typed)}, true
	case float64:
		if typed != float64(int64(typed)) {
			return ShadowLegacyKey{}, false
		}
		return ShadowLegacyKey{Kind: "number", Value: strconv.FormatInt(int64(typed), 10)}, true
	default:
		return ShadowLegacyKey{}, false
	}
}

func projectLegacyKey(key ShadowLegacyKey) any {
	if key.Kind == "number" {
		if number, err := strconv.ParseInt(key.Value, 10, 64); err == nil {
			return number
		}
	}
	return key.Value
}

func decodeShadowConfig(value any) (map[string]any, string, error) {
	if value == nil {
		return map[string]any{}, "string", nil
	}
	if object, ok := value.(map[string]any); ok {
		return object, "object", nil
	}
	text, ok := value.(string)
	if !ok {
		return nil, "", errors.New("config is not an object or encoded object")
	}
	if strings.TrimSpace(text) == "" {
		return map[string]any{}, "string", nil
	}
	var object map[string]any
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.UseNumber()
	if err := decoder.Decode(&object); err != nil || object == nil {
		return nil, "", errors.New("config JSON is invalid")
	}
	if err := ensureShadowEOF(decoder); err != nil {
		return nil, "", err
	}
	return object, "string", nil
}

func encodeLegacyConfig(config map[string]any, encoding string) any {
	if encoding == "object" {
		return config
	}
	raw, _ := json.Marshal(config)
	return string(raw)
}

func shadowAliasValue(config map[string]any, canonical string) (any, string, bool) {
	if value, ok := config[canonical]; ok {
		return value, canonical, true
	}
	aliases := make([]string, 0, 3)
	for alias, target := range shellAliases {
		if target == canonical && alias != canonical {
			aliases = append(aliases, alias)
		}
	}
	sort.Strings(aliases)
	for _, alias := range aliases {
		if value, ok := config[alias]; ok {
			return value, alias, true
		}
	}
	return nil, "", false
}

func nonNegativeInt(value any, fallback int) (int, bool) {
	parsed := positiveOrZeroInt64(value, int64(fallback))
	if parsed > int64(^uint(0)>>1) {
		return fallback, false
	}
	return int(parsed), parsed != int64(fallback) || value != nil
}

func positiveInt64(value any, fallback int64) int64 {
	parsed := positiveOrZeroInt64(value, fallback)
	if parsed < 1 {
		return fallback
	}
	return parsed
}

func positiveOrZeroInt64(value any, fallback int64) int64 {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := strconv.ParseInt(string(typed), 10, 64)
		if err == nil && parsed >= 0 {
			return parsed
		}
	case float64:
		if typed >= 0 && typed == float64(int64(typed)) {
			return int64(typed)
		}
	case int:
		if typed >= 0 {
			return int64(typed)
		}
	case int64:
		if typed >= 0 {
			return typed
		}
	}
	return fallback
}

func finiteNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := strconv.ParseFloat(string(typed), 64)
		return parsed, err == nil
	case float64:
		return typed, true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	default:
		return 0, false
	}
}

func structuralPayload(value map[string]any) map[string]any {
	keys := sortedMapKeys(value)
	keys = slicesWithout(keys, "config", "items")
	return map[string]any{"fields": keys}
}

func sortedMapKeys(value map[string]any) []string {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func slicesWithout(values []string, removed ...string) []string {
	result := values[:0]
	for _, value := range values {
		if !oneOf(value, removed...) {
			result = append(result, value)
		}
	}
	return result
}

func cloneMap(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func decodeJSONValue(raw []byte, target any) error {
	return json.Unmarshal(raw, target)
}

func ensureShadowEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err == nil {
		return errors.New("multiple JSON values")
	} else if !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}

func oneOf(value string, values ...string) bool {
	for _, candidate := range values {
		if value == candidate {
			return true
		}
	}
	return false
}
