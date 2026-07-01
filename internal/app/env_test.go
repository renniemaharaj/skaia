package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureRootLiveKitEnvInitializesSharedValues(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GRENGO_ROOT", root)

	envFile := filepath.Join(root, ".env")
	initial := strings.Join([]string{
		"POSTGRES_USER=skaia",
		"POSTGRES_PASSWORD=secret",
		"LIVEKIT_API_SECRET=",
	}, "\n") + "\n"
	if err := os.WriteFile(envFile, []byte(initial), 0644); err != nil {
		t.Fatalf("write env: %v", err)
	}

	added := ensureRootLiveKitEnv()
	if added == 0 {
		t.Fatal("ensureRootLiveKitEnv did not report any additions")
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

func TestSyncClientComposeRootEnvAddsRootEnvAfterClientEnv(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GRENGO_ROOT", root)

	clientDir := filepath.Join(root, "backends", "home")
	if err := os.MkdirAll(clientDir, 0755); err != nil {
		t.Fatalf("mkdir client dir: %v", err)
	}
	composeFile := filepath.Join(clientDir, "compose.yml")
	initial := strings.Join([]string{
		"services:",
		"  backend:",
		"    env_file:",
		"      - .env",
		"    image: skaia-backend:latest",
	}, "\n") + "\n"
	if err := os.WriteFile(composeFile, []byte(initial), 0644); err != nil {
		t.Fatalf("write compose: %v", err)
	}

	if changed := syncClientComposeRootEnv("home"); changed != 1 {
		t.Fatalf("syncClientComposeRootEnv changed = %d, want 1", changed)
	}

	content, err := os.ReadFile(composeFile)
	if err != nil {
		t.Fatalf("read compose: %v", err)
	}
	want := "    env_file:\n      - .env\n      - ../../.env\n"
	if !strings.Contains(string(content), want) {
		t.Fatalf("compose missing root env_file:\n%s", content)
	}
	if changed := syncClientComposeRootEnv("home"); changed != 0 {
		t.Fatalf("second sync changed = %d, want 0", changed)
	}
}
