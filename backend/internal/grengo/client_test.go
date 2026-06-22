package grengo

import "testing"

func TestNormalizeGRPCTarget(t *testing.T) {
	tests := map[string]string{
		"http://host.docker.internal:9100":      "host.docker.internal:9100",
		"https://host.docker.internal:9100/api": "host.docker.internal:9100",
		"host.docker.internal":                  "host.docker.internal:9100",
		"host.docker.internal:9101":             "host.docker.internal:9101",
		"localhost:9100?ignored=true":           "localhost:9100",
		"http://127.0.0.1":                      "127.0.0.1:9100",
		"[::1]":                                 "[::1]:9100",
		"[::1]:9100":                            "[::1]:9100",
	}

	for input, want := range tests {
		if got := normalizeGRPCTarget(input); got != want {
			t.Fatalf("normalizeGRPCTarget(%q) = %q, want %q", input, got, want)
		}
	}
}
