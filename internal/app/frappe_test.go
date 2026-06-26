package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFrappeVersion(t *testing.T) {
	tests := []struct {
		input       string
		wantID      string
		wantBranch  string
		wantCompose string
		shouldError bool
	}{
		{input: "", wantID: "16", wantBranch: "version-16", wantCompose: "compose.v16.yml"},
		{input: "15", wantID: "15", wantBranch: "version-15", wantCompose: "compose.v15.yml"},
		{input: "16", wantID: "16", wantBranch: "version-16", wantCompose: "compose.v16.yml"},
		{input: "17-dev", wantID: "17-dev", wantBranch: "develop", wantCompose: "compose.v17-dev.yml"},
		{input: "latest", shouldError: true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := frappeVersion(tt.input)
			if tt.shouldError {
				if err == nil {
					t.Fatalf("frappeVersion(%q) returned nil error", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("frappeVersion(%q) error: %v", tt.input, err)
			}
			if got.ID != tt.wantID || got.Branch != tt.wantBranch || got.ComposeFile != tt.wantCompose {
				t.Fatalf("frappeVersion(%q) = %#v", tt.input, got)
			}
		})
	}
}

func TestRenderFrappeCompose(t *testing.T) {
	dir := t.TempDir()
	templatePath := filepath.Join(dir, "compose.yml")
	template := "context: __FRAPPE_CONTEXT__\nvolume: __INSTANCE_PATH__\nname: __SAFE_VERSION__-__CLUSTER_ID__\nports:\n  - \"__HTTP_PORT__:80\"\n  - \"__GRPC_PORT__:3001\"\n"
	if err := os.WriteFile(templatePath, []byte(template), 0644); err != nil {
		t.Fatal(err)
	}

	got, err := renderFrappeCompose(templatePath, "/project/pkg/frappe", "/tmp/instance.json", "v16", 2, 8161, 3162)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(got, "__") {
		t.Fatalf("rendered compose still contains placeholder: %s", got)
	}
	for _, want := range []string{"/project/pkg/frappe", "/tmp/instance.json", "v16-2", "\"8161:80\"", "\"3162:3001\""} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered compose missing %q: %s", want, got)
		}
	}
}
