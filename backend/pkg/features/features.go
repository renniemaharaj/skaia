// Package features is the authoritative registry for tenant feature gates.
// Backend projections and administrative tooling must derive their lists from
// this package so adding a feature cannot leave client creation prompts stale.
package features

var defaultNames = []string{
	"landing",
	"store",
	"forum",
	"docs",
	"cart",
	"users",
	"inbox",
	"presence",
}

var optionalNames = []string{
	"status",
	"rewards",
	"rankings",
	"community",
}

// DefaultNames returns the backwards-compatible features enabled when a tenant
// has no explicit FEATURES_ENABLED value.
func DefaultNames() []string { return append([]string(nil), defaultNames...) }

// OptionalNames returns feature gates that remain opt-in for legacy tenants.
func OptionalNames() []string { return append([]string(nil), optionalNames...) }

// AllNames returns every supported feature in stable presentation order.
func AllNames() []string {
	names := make([]string, 0, len(defaultNames)+len(optionalNames))
	names = append(names, defaultNames...)
	names = append(names, optionalNames...)
	return names
}
