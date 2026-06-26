package app

import "testing"

func TestFrappeVersion(t *testing.T) {
	tests := []struct {
		input       string
		wantID      string
		wantBranch  string
		wantPython  string
		wantNode    int
		shouldError bool
	}{
		{input: "", wantID: "16", wantBranch: "version-16", wantPython: "python:3.12-bookworm", wantNode: 20},
		{input: "15", wantID: "15", wantBranch: "version-15", wantPython: "python:3.11-bookworm", wantNode: 18},
		{input: "16", wantID: "16", wantBranch: "version-16", wantPython: "python:3.12-bookworm", wantNode: 20},
		{input: "17-dev", wantID: "17-dev", wantBranch: "develop", wantPython: "python:3.14.2-trixie", wantNode: 24},
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
			if got.ID != tt.wantID || got.Branch != tt.wantBranch || got.PythonImage != tt.wantPython || got.NodeMajor != tt.wantNode {
				t.Fatalf("frappeVersion(%q) = %#v", tt.input, got)
			}
		})
	}
}
