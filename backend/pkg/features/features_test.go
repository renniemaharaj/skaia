package features

import "testing"

func TestRegistryIsUniqueAndComplete(t *testing.T) {
	seen := map[string]bool{}
	for _, name := range AllNames() {
		if name == "" {
			t.Fatal("feature registry contains an empty name")
		}
		if seen[name] {
			t.Fatalf("feature registry contains duplicate %q", name)
		}
		seen[name] = true
	}
	for _, name := range []string{"status", "rewards", "rankings", "community"} {
		if !seen[name] {
			t.Fatalf("feature registry omitted %q", name)
		}
	}
}
