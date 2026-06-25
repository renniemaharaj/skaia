package repo

import "testing"

func TestProjectRootUsesEnvOverride(t *testing.T) {
	t.Setenv("GRENGO_ROOT", "/tmp/skaia-test-root")

	if got := ProjectRoot(); got != "/tmp/skaia-test-root" {
		t.Fatalf("ProjectRoot() = %q, want env override", got)
	}
}
