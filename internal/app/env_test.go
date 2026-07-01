package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSyncEnvDefaultsInitializesMissingLiveKitValues(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GRENGO_ROOT", root)

	clientDir := filepath.Join(root, "backends", "home")
	if err := os.MkdirAll(clientDir, 0755); err != nil {
		t.Fatalf("mkdir client dir: %v", err)
	}
	envFile := filepath.Join(clientDir, ".env")
	initial := strings.Join([]string{
		"CLIENT_NAME=home",
		"PORT=1080",
		"POSTGRES_DB=home",
		"# LIVEKIT_API_KEY=old-commented-key",
		"LIVEKIT_API_SECRET=",
	}, "\n") + "\n"
	if err := os.WriteFile(envFile, []byte(initial), 0644); err != nil {
		t.Fatalf("write env: %v", err)
	}

	added := syncEnvDefaults("home")
	if added == 0 {
		t.Fatal("syncEnvDefaults did not report any additions")
	}

	apiKey := envVal(envFile, "LIVEKIT_API_KEY")
	apiSecret := envVal(envFile, "LIVEKIT_API_SECRET")
	url := envVal(envFile, "LIVEKIT_URL")

	if !strings.HasPrefix(apiKey, "skaia-") || apiKey == "skaia-dev-key" {
		t.Fatalf("LIVEKIT_API_KEY = %q, want generated skaia-* value", apiKey)
	}
	if len(apiSecret) != 64 || apiSecret == "skaia-dev-secret-change-me" {
		t.Fatalf("LIVEKIT_API_SECRET = %q, want generated 32-byte hex secret", apiSecret)
	}
	if url != "ws://localhost:7880" {
		t.Fatalf("LIVEKIT_URL = %q, want default URL", url)
	}

	content, err := os.ReadFile(envFile)
	if err != nil {
		t.Fatalf("read env: %v", err)
	}
	if strings.Count(string(content), "LIVEKIT_API_SECRET=") != 1 {
		t.Fatalf("LIVEKIT_API_SECRET should be updated in place, env:\n%s", content)
	}
}
