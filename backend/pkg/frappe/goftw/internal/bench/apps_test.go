package bench

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAppInCatalog(t *testing.T) {
	if !appInCatalog("erpnext") {
		t.Fatal("erpnext should be in the available app catalog")
	}
	if appInCatalog("not-a-real-app") {
		t.Fatal("unexpected app should not be in the available app catalog")
	}
}

func TestAppSourceReady(t *testing.T) {
	dir := t.TempDir()
	b := &Bench{Path: dir}

	if b.appSourceReady("erpnext") {
		t.Fatal("missing app source should not be ready")
	}

	appModule := filepath.Join(dir, "apps", "erpnext", "erpnext")
	if err := os.MkdirAll(appModule, 0755); err != nil {
		t.Fatalf("mkdir app module: %v", err)
	}
	if b.appSourceReady("erpnext") {
		t.Fatal("app source without hooks.py should not be ready")
	}

	if err := os.WriteFile(filepath.Join(appModule, "hooks.py"), []byte("# test\n"), 0644); err != nil {
		t.Fatalf("write hooks.py: %v", err)
	}
	if !b.appSourceReady("erpnext") {
		t.Fatal("app source with module directory and hooks.py should be ready")
	}
}
