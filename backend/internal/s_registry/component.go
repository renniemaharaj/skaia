package s_registry

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// BindPointKind classifies the data contract a bind point expects.
type BindPointKind string

const (
	BindText     BindPointKind = "text"
	BindRichText BindPointKind = "rich_text"
	BindNumber   BindPointKind = "number"
	BindBoolean  BindPointKind = "boolean"
	BindURL      BindPointKind = "url"
	BindMedia    BindPointKind = "media"
	BindImage    BindPointKind = "image"
	BindVideo    BindPointKind = "video"
	BindObject   BindPointKind = "object"
	BindArray    BindPointKind = "array"
	BindAction   BindPointKind = "action"
	BindAny      BindPointKind = "any"
)

var validBindKinds = map[BindPointKind]bool{
	BindText: true, BindRichText: true, BindNumber: true,
	BindBoolean: true, BindURL: true, BindMedia: true,
	BindImage: true, BindVideo: true, BindObject: true,
	BindArray: true, BindAction: true, BindAny: true,
}

// BindPoint describes a single data target on a component.
type BindPoint struct {
	Key         string        `json:"key"`
	Label       string        `json:"label"`
	Description string        `json:"description"`
	Kind        BindPointKind `json:"kind"`
	Required    bool          `json:"required"`
	Fallback    interface{}   `json:"fallback,omitempty"`
}

// ComponentDefinition describes a registered UI component that can be
// selected for derived/custom section row rendering.
type ComponentDefinition struct {
	Type         string          `json:"type"`
	Label        string          `json:"label"`
	Group        string          `json:"group"`
	Description  string          `json:"description"`
	Repeatable   bool            `json:"repeatable"`
	PropsSchema  json.RawMessage `json:"props_schema"`
	StyleTargets []string        `json:"style_targets"`
	BindPoints   []BindPoint     `json:"bind_points"`
	Version      int             `json:"version"`
}

// componentsByType is populated by init.
var componentsByType map[string]ComponentDefinition

var componentDefinitions = []ComponentDefinition{
	// ────── Primitives ──────
	{
		Type:        "primitive.div",
		Label:       "Container",
		Group:       "primitive",
		Description: "Generic container for layout and grouping.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root"},
		BindPoints:   []BindPoint{},
		Version:      1,
	},
	{
		Type:        "primitive.text",
		Label:       "Text",
		Group:       "primitive",
		Description: "Single or multi-line text display.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root"},
		BindPoints: []BindPoint{
			{Key: "body", Label: "Body", Description: "Text content to display.", Kind: BindText, Required: true},
		},
		Version: 1,
	},
	{
		Type:        "primitive.button",
		Label:       "Button",
		Group:       "primitive",
		Description: "Clickable button with text label.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root"},
		BindPoints: []BindPoint{
			{Key: "title", Label: "Label", Description: "Button label text.", Kind: BindText, Required: true},
			{Key: "href", Label: "Link", Description: "Navigation target URL.", Kind: BindURL, Required: false},
			{Key: "disabled", Label: "Disabled", Description: "Whether the button is disabled.", Kind: BindBoolean, Required: false, Fallback: false},
		},
		Version: 1,
	},
	{
		Type:        "primitive.checkbox",
		Label:       "Checkbox",
		Group:       "primitive",
		Description: "Boolean checkbox input.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root", "label"},
		BindPoints: []BindPoint{
			{Key: "checked", Label: "Checked", Description: "Whether the checkbox is checked.", Kind: BindBoolean, Required: true},
			{Key: "title", Label: "Label", Description: "Checkbox label text.", Kind: BindText, Required: false},
			{Key: "disabled", Label: "Disabled", Description: "Whether the checkbox is disabled.", Kind: BindBoolean, Required: false, Fallback: false},
		},
		Version: 1,
	},
	{
		Type:        "primitive.image",
		Label:       "Image",
		Group:       "primitive",
		Description: "Image display with alt text.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root", "image"},
		BindPoints: []BindPoint{
			{Key: "media", Label: "Source", Description: "Image URL.", Kind: BindImage, Required: true},
			{Key: "alt", Label: "Alt text", Description: "Accessible description.", Kind: BindText, Required: false, Fallback: ""},
			{Key: "href", Label: "Link", Description: "Optional click-through URL.", Kind: BindURL, Required: false},
		},
		Version: 1,
	},
	{
		Type:        "primitive.link",
		Label:       "Link",
		Group:       "primitive",
		Description: "Hyperlink with text label.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root"},
		BindPoints: []BindPoint{
			{Key: "title", Label: "Label", Description: "Link display text.", Kind: BindText, Required: true},
			{Key: "href", Label: "URL", Description: "Navigation target.", Kind: BindURL, Required: true},
		},
		Version: 1,
	},
	{
		Type:        "primitive.icon",
		Label:       "Icon / Badge",
		Group:       "primitive",
		Description: "Status icon or badge indicator.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root"},
		BindPoints: []BindPoint{
			{Key: "icon", Label: "Icon", Description: "Icon key or URL.", Kind: BindText, Required: true},
			{Key: "aria_label", Label: "Label", Description: "Accessible label for the icon.", Kind: BindText, Required: false},
		},
		Version: 1,
	},

	// ────── Compound ──────
	{
		Type:        "compound.card",
		Label:       "Card",
		Group:       "compound",
		Description: "Surface with heading, body, image, and link zones.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root", "header", "body", "image", "footer"},
		BindPoints: []BindPoint{
			{Key: "title", Label: "Title", Description: "Card heading text.", Kind: BindText, Required: false},
			{Key: "body", Label: "Body", Description: "Card body content.", Kind: BindRichText, Required: false},
			{Key: "media", Label: "Image", Description: "Card image or media.", Kind: BindImage, Required: false},
			{Key: "href", Label: "Link", Description: "Card click-through URL.", Kind: BindURL, Required: false},
			{Key: "icon", Label: "Icon", Description: "Optional icon/badge.", Kind: BindText, Required: false},
		},
		Version: 1,
	},
	{
		Type:        "compound.stat",
		Label:       "Stat Card",
		Group:       "compound",
		Description: "Metric display with value, label, and icon.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root", "value", "label", "icon"},
		BindPoints: []BindPoint{
			{Key: "title", Label: "Value", Description: "Metric value text.", Kind: BindText, Required: true},
			{Key: "body", Label: "Label", Description: "Metric label/description.", Kind: BindText, Required: false},
			{Key: "icon", Label: "Icon", Description: "Metric icon.", Kind: BindText, Required: false},
		},
		Version: 1,
	},
	{
		Type:        "compound.media_card",
		Label:       "Media Card",
		Group:       "compound",
		Description: "Card optimized for image/video display with caption.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root", "media", "caption"},
		BindPoints: []BindPoint{
			{Key: "media", Label: "Media", Description: "Image or video URL.", Kind: BindMedia, Required: true},
			{Key: "title", Label: "Caption", Description: "Media caption.", Kind: BindText, Required: false},
			{Key: "href", Label: "Link", Description: "Optional click-through.", Kind: BindURL, Required: false},
		},
		Version: 1,
	},
	{
		Type:        "compound.profile",
		Label:       "Profile Card",
		Group:       "compound",
		Description: "User/entity profile with avatar, name, and bio.",
		Repeatable:  true,
		PropsSchema: json.RawMessage(`{}`),
		StyleTargets: []string{"root", "avatar", "name", "bio"},
		BindPoints: []BindPoint{
			{Key: "media", Label: "Avatar", Description: "Profile image.", Kind: BindImage, Required: false},
			{Key: "title", Label: "Name", Description: "Display name.", Kind: BindText, Required: true},
			{Key: "body", Label: "Bio", Description: "Short bio or description.", Kind: BindRichText, Required: false},
			{Key: "href", Label: "Profile Link", Description: "Link to full profile.", Kind: BindURL, Required: false},
		},
		Version: 1,
	},
}

func init() {
	componentsByType = make(map[string]ComponentDefinition, len(componentDefinitions))
	for _, c := range componentDefinitions {
		componentsByType[c.Type] = c
	}
}

// ListComponents returns a stable sorted copy of all component definitions.
func ListComponents() []ComponentDefinition {
	out := append([]ComponentDefinition(nil), componentDefinitions...)
	sort.Slice(out, func(i, j int) bool { return out[i].Type < out[j].Type })
	return out
}

// GetComponent returns one component definition by type key.
func GetComponent(typ string) (ComponentDefinition, bool) {
	c, ok := componentsByType[typ]
	return c, ok
}

// IsComponentSupported reports whether typ is a registered component type.
func IsComponentSupported(typ string) bool {
	_, ok := componentsByType[typ]
	return ok
}

// allowedStyleProperties is the set of CSS properties that style overrides may
// target. Anything outside this list is rejected to prevent XSS/layout breakage.
var allowedStyleProperties = map[string]bool{
	"color": true, "background-color": true, "background": true,
	"border": true, "border-color": true, "border-radius": true, "border-width": true,
	"font-size": true, "font-weight": true, "font-family": true, "font-style": true,
	"text-align": true, "text-decoration": true, "text-transform": true,
	"line-height": true, "letter-spacing": true,
	"padding": true, "padding-top": true, "padding-right": true, "padding-bottom": true, "padding-left": true,
	"margin": true, "margin-top": true, "margin-right": true, "margin-bottom": true, "margin-left": true,
	"width": true, "max-width": true, "min-width": true,
	"height": true, "max-height": true, "min-height": true,
	"gap": true, "opacity": true, "box-shadow": true,
	"display": true, "flex-direction": true, "align-items": true, "justify-content": true,
	"overflow": true, "white-space": true, "word-break": true,
}

// ValidateComponentConfig validates a section's component-related config fields.
// It checks that component_type is registered, all bind-point keys exist on the
// component, required bind points have mappings, and style overrides only target
// allowed properties on valid style targets.
func ValidateComponentConfig(cfg map[string]interface{}) error {
	compTypeRaw, hasType := cfg["component_type"]
	if !hasType {
		return nil // no component selection — nothing to validate
	}

	compType, ok := compTypeRaw.(string)
	if !ok || compType == "" {
		return fmt.Errorf("component_type must be a non-empty string")
	}

	comp, ok := GetComponent(compType)
	if !ok {
		return fmt.Errorf("unknown component_type %q", compType)
	}

	// Build bind-point lookup
	bpByKey := make(map[string]BindPoint, len(comp.BindPoints))
	for _, bp := range comp.BindPoints {
		bpByKey[bp.Key] = bp
	}

	// Validate bindings
	if bindings, ok := cfg["bindings"]; ok {
		bindMap, ok := bindings.(map[string]interface{})
		if !ok {
			return fmt.Errorf("bindings must be an object")
		}
		for key := range bindMap {
			if _, exists := bpByKey[key]; !exists {
				return fmt.Errorf("unknown bind-point key %q for component %q", key, compType)
			}
		}
	}

	// Check required bind points have mappings
	if bindings, ok := cfg["bindings"].(map[string]interface{}); ok {
		for _, bp := range comp.BindPoints {
			if bp.Required {
				if _, bound := bindings[bp.Key]; !bound && bp.Fallback == nil {
					return fmt.Errorf("required bind-point %q is not mapped for component %q", bp.Key, compType)
				}
			}
		}
	} else {
		// No bindings at all — check if any are required without fallback
		for _, bp := range comp.BindPoints {
			if bp.Required && bp.Fallback == nil {
				return fmt.Errorf("required bind-point %q is not mapped for component %q", bp.Key, compType)
			}
		}
	}

	// Build style target lookup
	stSet := make(map[string]bool, len(comp.StyleTargets))
	for _, st := range comp.StyleTargets {
		stSet[st] = true
	}

	// Validate style overrides
	if overrides, ok := cfg["style_overrides"]; ok {
		overrideMap, ok := overrides.(map[string]interface{})
		if !ok {
			return fmt.Errorf("style_overrides must be an object")
		}
		for target, props := range overrideMap {
			if !stSet[target] {
				return fmt.Errorf("unknown style_target %q for component %q", target, compType)
			}
			propsMap, ok := props.(map[string]interface{})
			if !ok {
				return fmt.Errorf("style_overrides[%q] must be an object", target)
			}
			for prop := range propsMap {
				normalised := strings.ToLower(strings.TrimSpace(prop))
				if !allowedStyleProperties[normalised] {
					return fmt.Errorf("style property %q is not allowed in style_overrides", prop)
				}
			}
		}
	}

	return nil
}
