package s_registry

import (
	"testing"
)

func TestListComponentsReturnsAllRegistered(t *testing.T) {
	list := ListComponents()
	if len(list) == 0 {
		t.Fatal("expected at least one component definition")
	}

	// Verify sorted order
	for i := 1; i < len(list); i++ {
		if list[i].Type < list[i-1].Type {
			t.Errorf("ListComponents not sorted: %s came after %s", list[i].Type, list[i-1].Type)
		}
	}
}

func TestGetComponentReturnsPrimitiveAndCompound(t *testing.T) {
	cases := []struct {
		typ   string
		group string
	}{
		{"primitive.div", "primitive"},
		{"primitive.text", "primitive"},
		{"primitive.button", "primitive"},
		{"primitive.checkbox", "primitive"},
		{"primitive.image", "primitive"},
		{"primitive.link", "primitive"},
		{"primitive.icon", "primitive"},
		{"compound.card", "compound"},
		{"compound.stat", "compound"},
		{"compound.media_card", "compound"},
		{"compound.profile", "compound"},
	}
	for _, tc := range cases {
		t.Run(tc.typ, func(t *testing.T) {
			c, ok := GetComponent(tc.typ)
			if !ok {
				t.Fatalf("expected component %s to be registered", tc.typ)
			}
			if c.Group != tc.group {
				t.Errorf("expected group %q, got %q", tc.group, c.Group)
			}
			if c.Version < 1 {
				t.Errorf("expected version >= 1, got %d", c.Version)
			}
			if !c.Repeatable {
				t.Errorf("expected %s to be repeatable", tc.typ)
			}
		})
	}
}

func TestGetComponentUnknown(t *testing.T) {
	_, ok := GetComponent("unknown.widget")
	if ok {
		t.Fatal("expected unknown component to not be found")
	}
}

func TestIsComponentSupported(t *testing.T) {
	if !IsComponentSupported("compound.card") {
		t.Fatal("expected compound.card to be supported")
	}
	if IsComponentSupported("nonexistent") {
		t.Fatal("expected nonexistent to not be supported")
	}
}

func TestCompoundCardHasExpectedBindPoints(t *testing.T) {
	c, ok := GetComponent("compound.card")
	if !ok {
		t.Fatal("expected compound.card to exist")
	}

	wantKeys := []string{"title", "body", "media", "href", "icon"}
	got := make(map[string]bool, len(c.BindPoints))
	for _, bp := range c.BindPoints {
		got[bp.Key] = true
	}
	for _, k := range wantKeys {
		if !got[k] {
			t.Errorf("expected bind-point %q on compound.card", k)
		}
	}
}

func TestValidateComponentConfigNoComponent(t *testing.T) {
	// Config without component_type should pass
	cfg := map[string]interface{}{
		"datasource_id": float64(1),
	}
	if err := ValidateComponentConfig(cfg); err != nil {
		t.Fatalf("expected nil error for config without component_type, got %v", err)
	}
}

func TestValidateComponentConfigUnknownType(t *testing.T) {
	cfg := map[string]interface{}{
		"component_type": "unknown.widget",
	}
	err := ValidateComponentConfig(cfg)
	if err == nil {
		t.Fatal("expected error for unknown component_type")
	}
}

func TestValidateComponentConfigValidBindings(t *testing.T) {
	cfg := map[string]interface{}{
		"component_type": "compound.card",
		"bindings": map[string]interface{}{
			"title": "col_name",
			"body":  "col_desc",
		},
	}
	if err := ValidateComponentConfig(cfg); err != nil {
		t.Fatalf("expected nil error for valid bindings, got %v", err)
	}
}

func TestValidateComponentConfigUnknownBindPoint(t *testing.T) {
	cfg := map[string]interface{}{
		"component_type": "compound.card",
		"bindings": map[string]interface{}{
			"nonexistent_field": "col_x",
		},
	}
	err := ValidateComponentConfig(cfg)
	if err == nil {
		t.Fatal("expected error for unknown bind-point key")
	}
}

func TestValidateComponentConfigMissingRequiredBindPoint(t *testing.T) {
	// primitive.text has body as required with no fallback
	cfg := map[string]interface{}{
		"component_type": "primitive.text",
		"bindings":       map[string]interface{}{},
	}
	err := ValidateComponentConfig(cfg)
	if err == nil {
		t.Fatal("expected error for missing required bind-point")
	}
}

func TestValidateComponentConfigRequiredSatisfied(t *testing.T) {
	cfg := map[string]interface{}{
		"component_type": "primitive.text",
		"bindings": map[string]interface{}{
			"body": "text_col",
		},
	}
	if err := ValidateComponentConfig(cfg); err != nil {
		t.Fatalf("expected nil error when required bind-point is satisfied, got %v", err)
	}
}

func TestValidateComponentConfigStyleOverridesValid(t *testing.T) {
	cfg := map[string]interface{}{
		"component_type": "compound.card",
		"style_overrides": map[string]interface{}{
			"root": map[string]interface{}{
				"background-color": "#ff0000",
				"border-radius":    "8px",
			},
		},
	}
	if err := ValidateComponentConfig(cfg); err != nil {
		t.Fatalf("expected nil error for valid style overrides, got %v", err)
	}
}

func TestValidateComponentConfigStyleOverridesUnknownTarget(t *testing.T) {
	cfg := map[string]interface{}{
		"component_type": "primitive.text",
		"bindings":       map[string]interface{}{"body": "col"},
		"style_overrides": map[string]interface{}{
			"nonexistent_target": map[string]interface{}{
				"color": "red",
			},
		},
	}
	err := ValidateComponentConfig(cfg)
	if err == nil {
		t.Fatal("expected error for unknown style target")
	}
}

func TestValidateComponentConfigStyleOverridesUnsafeProperty(t *testing.T) {
	cfg := map[string]interface{}{
		"component_type": "compound.card",
		"style_overrides": map[string]interface{}{
			"root": map[string]interface{}{
				"position": "fixed", // not allowed
			},
		},
	}
	err := ValidateComponentConfig(cfg)
	if err == nil {
		t.Fatal("expected error for disallowed CSS property")
	}
}

func TestValidateComponentConfigNoBindingsRequiredWithFallback(t *testing.T) {
	// primitive.button has "disabled" as required=false with fallback=false,
	// and "title" as required=true with no fallback.
	// Without any bindings, title should fail.
	cfg := map[string]interface{}{
		"component_type": "primitive.button",
	}
	err := ValidateComponentConfig(cfg)
	if err == nil {
		t.Fatal("expected error when no bindings provided for component with required bind-points without fallback")
	}
}
