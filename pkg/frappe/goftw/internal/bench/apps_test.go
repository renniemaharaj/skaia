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

func TestRequiredApps(t *testing.T) {
	dir := t.TempDir()
	b := &Bench{Path: dir}
	appModule := filepath.Join(dir, "apps", "helpdesk", "helpdesk")
	if err := os.MkdirAll(appModule, 0755); err != nil {
		t.Fatalf("mkdir app module: %v", err)
	}
	hooks := []byte(`
app_name = "helpdesk"
required_apps = [
    "telephony",
    'crm',
    "frappe",
    "telephony",
]
`)
	if err := os.WriteFile(filepath.Join(appModule, "hooks.py"), hooks, 0644); err != nil {
		t.Fatalf("write hooks.py: %v", err)
	}

	got, err := b.requiredApps("helpdesk")
	if err != nil {
		t.Fatalf("requiredApps returned error: %v", err)
	}
	want := []string{"telephony", "crm"}
	if len(got) != len(want) {
		t.Fatalf("requiredApps length = %d (%#v), want %d", len(got), got, len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("requiredApps[%d] = %q, want %q (all: %#v)", i, got[i], want[i], got)
		}
	}
}
