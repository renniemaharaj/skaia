package main

import (
	"os"
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
