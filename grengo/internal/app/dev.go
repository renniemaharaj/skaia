package app

import (
	"os"
	"os/exec"
	"path/filepath"
)

func cmdDev() {
	loadSharedEnv()

	log("Starting infrastructure and backends for development...")
	cmdComposeUp(false, false)

	log("Starting grengo API server on port %d...", DefaultAPIPort)
	go cmdAPIStart(DefaultAPIPort)

	frontendDir := filepath.Join(ProjectRoot(), "backend", "frontend")
	log("Starting Vite dev server in %s...", frontendDir)

	cmd := exec.Command("npm", "run", "dev")
	cmd.Dir = frontendDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	if err := cmd.Run(); err != nil {
		die("Vite dev server exited with error: %v", err)
	}
}
