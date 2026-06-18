package datasource

import "testing"

func TestCompileSourceKeyUsesFiles(t *testing.T) {
	filesA := map[string]string{"main.ts": "export default 1", "lib.ts": "export const x = 1"}
	filesB := map[string]string{"main.ts": "export default 1", "lib.ts": "export const x = 2"}

	keyA := compileSourceKey("", filesA)
	keyB := compileSourceKey("", filesB)
	if keyA == "" {
		t.Fatal("expected non-empty key for files")
	}
	if keyA == keyB {
		t.Fatal("expected different file contents to produce different cache keys")
	}
}

func TestCompileSourceKeyFallsBackToLegacySource(t *testing.T) {
	if got := compileSourceKey("legacy", nil); got != "legacy" {
		t.Fatalf("key = %q, want legacy source", got)
	}
}
