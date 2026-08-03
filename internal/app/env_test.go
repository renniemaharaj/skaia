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

func TestSyncFrontendIndexPathDefaultMigratesOnlyKnownLegacyPath(t *testing.T) {
	tests := []struct {
		name        string
		initial     string
		want        string
		wantChanged int
	}{
		{
			name:        "legacy generated path",
			initial:     "/frontend/dist/index.html",
			want:        "/app/frontend/dist/index.html",
			wantChanged: 1,
		},
		{
			name:        "current generated path",
			initial:     "/app/frontend/dist/index.html",
			want:        "/app/frontend/dist/index.html",
			wantChanged: 0,
		},
		{
			name:        "operator override",
			initial:     "/srv/custom/index.html",
			want:        "/srv/custom/index.html",
			wantChanged: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			envFile := filepath.Join(t.TempDir(), ".env")
			if err := os.WriteFile(envFile, []byte("INDEX_FILE_PATH="+tt.initial+"\n"), 0600); err != nil {
				t.Fatal(err)
			}
			if changed := syncFrontendIndexPathDefault(envFile); changed != tt.wantChanged {
				t.Fatalf("changed = %d, want %d", changed, tt.wantChanged)
			}
			if got := envVal(envFile, "INDEX_FILE_PATH"); got != tt.want {
				t.Fatalf("INDEX_FILE_PATH = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSyncRootComposeLiveKitEnvReplacesEmptyEnvFile(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GRENGO_ROOT", root)

	content := strings.Join([]string{
		"services:",
		"  livekit:",
		"    image: livekit/livekit-server:latest",
		"    restart: unless-stopped",
		"    env_file:",
		"      - \"\"",
		"    depends_on:",
		"      redis:",
		"        condition: service_healthy",
	}, "\n") + "\n"
	if err := os.WriteFile(filepath.Join(root, "compose.yml"), []byte(content), 0644); err != nil {
		t.Fatalf("write compose: %v", err)
	}

	if changed := syncRootComposeLiveKitEnv(); changed != 1 {
		t.Fatalf("syncRootComposeLiveKitEnv changed = %d, want 1", changed)
	}
	got, err := os.ReadFile(filepath.Join(root, "compose.yml"))
	if err != nil {
		t.Fatalf("read compose: %v", err)
	}
	if strings.Contains(string(got), "- \"\"") || !strings.Contains(string(got), "      - .env") {
		t.Fatalf("root compose was not repaired:\n%s", got)
	}
}
