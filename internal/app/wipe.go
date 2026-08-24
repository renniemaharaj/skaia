package app

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func cmdWipeAll() {
	fmt.Printf("%sThis will irreversibly delete all clients, uploads, and shared service data (postgres/redis).%s\n", colorRed, colorReset)
	if !confirmPromptWithLabel(colorYellow+"Type 'wipe all' to confirm: "+colorReset, "wipe all") {
		die("Aborted")
	}

	// Attempt every cleanup even when Docker is unavailable. A failed Compose
	// shutdown must not silently skip the explicitly confirmed filesystem wipe.
	if err := composeDown(); err != nil {
		warn("Some services could not be stopped; continuing the confirmed wipe: %v", err)
	}

	var failures []error
	if err := removeClientDirectories(backendsDir(), removeWipePath); err != nil {
		failures = append(failures, err)
	}
	for _, name := range []string{"postgres_data", "redis_data"} {
		if err := removeWipePath(filepath.Join(ProjectRoot(), name)); err != nil {
			failures = append(failures, err)
		}
	}

	if err := errors.Join(failures...); err != nil {
		die("Wipe incomplete; some data remains: %v", err)
	}
	log("Wipe complete. You can now run 'grengo new <name>' to create fresh clients.")
}

func removeClientDirectories(root string, remove func(string) error) error {
	cleanRoot := filepath.Clean(root)
	if cleanRoot == "." || cleanRoot == string(os.PathSeparator) || cleanRoot == filepath.Clean(ProjectRoot()) {
		return fmt.Errorf("refusing unsafe client root %s", root)
	}
	entries, err := os.ReadDir(cleanRoot)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read client directory %s: %w", cleanRoot, err)
	}

	var failures []error
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(cleanRoot, entry.Name())
		rel, relErr := filepath.Rel(cleanRoot, path)
		if relErr != nil || rel == "." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
			failures = append(failures, fmt.Errorf("refusing unsafe client wipe target %s", path))
			continue
		}
		if err := remove(path); err != nil {
			failures = append(failures, fmt.Errorf("remove client %s: %w", entry.Name(), err))
			continue
		}
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			if err == nil {
				err = errors.New("path still exists")
			}
			failures = append(failures, fmt.Errorf("verify client %s removal: %w", entry.Name(), err))
		}
	}
	return errors.Join(failures...)
}

func removeWipePath(path string) error {
	clean := filepath.Clean(path)
	if clean == "." || clean == string(os.PathSeparator) || clean == filepath.Clean(ProjectRoot()) {
		return fmt.Errorf("refusing unsafe wipe target %s", path)
	}
	if err := os.RemoveAll(clean); err != nil {
		warn("Cannot remove %s as current user - retrying with sudo…", clean)
		cmd := exec.Command("sudo", "rm", "-rf", "--", clean)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if sudoErr := cmd.Run(); sudoErr != nil {
			return fmt.Errorf("remove %s: %w", clean, sudoErr)
		}
	}
	if _, err := os.Lstat(clean); !os.IsNotExist(err) {
		if err == nil {
			err = errors.New("path still exists")
		}
		return fmt.Errorf("verify removal of %s: %w", clean, err)
	}
	return nil
}
