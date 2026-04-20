package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// Default configuration constants.
const (
	ImageName   = "skaia-backend"
	ImageTag    = "latest"
	NetworkName = "skaia-network"
	BasePort    = 1080
)

// Image returns the full Docker image reference.
func Image() string {
	return ImageName + ":" + ImageTag
}

// ProjectRoot returns the project root directory.
// It resolves through symlinks so the binary can live anywhere.
func ProjectRoot() string {
	exe, err := os.Executable()
	if err != nil {
		die("cannot determine executable path: %v", err)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		die("cannot resolve executable symlinks: %v", err)
	}
	// The binary is expected at <root>/grengo or <root>/cmd/grengo/grengo.
	// Walk up until we find compose.yml.
	dir := filepath.Dir(exe)
	for {
		if _, err := os.Stat(filepath.Join(dir, "compose.yml")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			// Fallback: use CWD
			cwd, _ := os.Getwd()
			return cwd
		}
		dir = parent
	}
}

// Derived paths.
func backendsDir() string { return filepath.Join(ProjectRoot(), "backends") }
func nginxDir() string    { return filepath.Join(ProjectRoot(), "nginx") }
func backendSrc() string  { return filepath.Join(ProjectRoot(), "backend") }
func composeFile() string { return filepath.Join(ProjectRoot(), "compose.yml") }
func rootEnvFile() string { return filepath.Join(ProjectRoot(), ".env") }

// ensureWritableDir creates dir (with parents) if it doesn't exist.
// If it already exists but is not writable by the current user (common when
// Docker created it as root), it attempts to fix ownership automatically
// and gives a clear message if that fails.
func ensureWritableDir(dir string) {
	info, err := os.Stat(dir)
	if err == nil {
		// Exists — check writability by trying to create a temp file.
		if !info.IsDir() {
			die("%s exists but is not a directory", dir)
		}
		tmp := filepath.Join(dir, ".grengo_write_test")
		f, err := os.Create(tmp)
		if err != nil {
			// Not writable. Try to fix with sudo chown.
			fixOwnership(dir)
			return
		}
		f.Close()
		os.Remove(tmp)
		return
	}

	// Does not exist — create it.
	if err := os.MkdirAll(dir, 0755); err != nil {
		die("Cannot create directory %s: %v", dir, err)
	}
}

// fixOwnership attempts to chown a directory to the current user via sudo.
func fixOwnership(dir string) {
	uid := os.Getuid()
	gid := os.Getgid()
	warn("%s is owned by another user (likely root from Docker).", dir)
	info("Attempting to fix ownership with sudo…")

	cmd := exec.Command("sudo", "chown", "-R",
		fmt.Sprintf("%d:%d", uid, gid), dir)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		die("Cannot fix ownership of %s.\n  Run manually: sudo chown -R $(id -u):$(id -g) %s", dir, dir)
	}
	log("Fixed ownership of %s", dir)
}
