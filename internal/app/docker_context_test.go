package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRootDockerContextExcludesTenantBackends(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", ".."))
	ignore, err := os.ReadFile(filepath.Join(root, ".dockerignore"))
	if err != nil {
		t.Fatal(err)
	}

	var excludesBackends bool
	for _, line := range strings.Split(string(ignore), "\n") {
		line = strings.TrimSpace(line)
		if line == "backends/" || line == "/backends/" || line == "backends/**" {
			excludesBackends = true
			break
		}
	}
	if !excludesBackends {
		t.Fatal("root .dockerignore must exclude backends/ so tenant .env and backups cannot enter a Docker build context")
	}

	if _, err := os.Stat(filepath.Join(root, "backends", "home", ".env")); err != nil && !os.IsNotExist(err) {
		t.Fatalf("inspect tenant env fixture: %v", err)
	}
}
