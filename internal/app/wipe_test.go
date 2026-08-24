package app

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRemoveClientDirectoriesRemovesEveryClient(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"home", "second"} {
		dir := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Join(dir, "uploads", "users"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("CLIENT_NAME="+name), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	if err := removeClientDirectories(root, os.RemoveAll); err != nil {
		t.Fatalf("remove clients: %v", err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("client directories remain: %v", entries)
	}
}

func TestRemoveClientDirectoriesContinuesAndReportsFailures(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"blocked", "removed"} {
		if err := os.Mkdir(filepath.Join(root, name), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	err := removeClientDirectories(root, func(path string) error {
		if strings.HasSuffix(path, "blocked") {
			return errors.New("permission denied")
		}
		return os.RemoveAll(path)
	})
	if err == nil || !strings.Contains(err.Error(), "blocked") {
		t.Fatalf("expected blocked client failure, got %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(root, "removed")); !os.IsNotExist(statErr) {
		t.Fatalf("unblocked client was not removed: %v", statErr)
	}
}
