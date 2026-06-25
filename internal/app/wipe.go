package app

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func cmdWipeAll() {
	fmt.Printf("%sThis will irreversibly delete all clients, uploads, and shared service data (postgres/redis).%s\n", colorRed, colorReset)
	fmt.Printf("%sType 'wipe all' to confirm: %s", colorYellow, colorReset)
	if !confirmPrompt("wipe all") {
		die("Aborted")
	}

	// Stop all containers and infrastructure.
	cmdComposeDown()

	// Remove all client directories under backends.
	entries, err := os.ReadDir(backendsDir())
	if err == nil {
		for _, e := range entries {
			if e.IsDir() {
				path := filepath.Join(backendsDir(), e.Name())
				if err := os.RemoveAll(path); err != nil {
					warn("Failed to remove %s: %v", path, err)
				}
			}
		}
	}

	// Remove shared data directories.
	for _, d := range []string{"postgres_data", "redis_data"} {
		path := filepath.Join(ProjectRoot(), d)
		if err := os.RemoveAll(path); err != nil {
			warn("Cannot remove %s as current user — retrying with sudo…", path)
			cmd := exec.Command("sudo", "rm", "-rf", path)
			cmd.Stdin = os.Stdin
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err2 := cmd.Run(); err2 != nil {
				warn("Failed to remove %s: %v", path, err2)
			}
		}
	}

	log("Wipe complete. You can now run 'grengo new <name>' to create fresh clients.")
}
