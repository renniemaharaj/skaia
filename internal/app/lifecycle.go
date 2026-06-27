package app

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// cmdEnable re-enables a disabled client.
func cmdEnable(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	os.Remove(filepath.Join(backendsDir(), name, ".disabled"))
	log("Client '%s' enabled", name)
	generateNginxConfig()
	reloadNginxIfRunning()
}

// cmdDisable disables a client and stops its backend if running.
func cmdDisable(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	disabledFile := filepath.Join(backendsDir(), name, ".disabled")
	if err := os.WriteFile(disabledFile, []byte{}, 0644); err != nil {
		die("Cannot create .disabled file: %v", err)
	}
	log("Client '%s' disabled", name)

	if clientRunning(name) {
		info("Stopping backend…")
		dockerComposeSilent(clientComposeFile(name), "down")
	}

	generateNginxConfig()
	reloadNginxIfRunning()
}

// cmdStart starts a client's backend container.
func cmdStart(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	if !clientEnabled(name) {
		die("Client '%s' is disabled – enable it first", name)
	}

	log("Building frontend first to ensure valid state...")
	distDir := buildFrontend()

	ensureNetwork()
	ensureImage()

	log("Starting %s…", name)
	if err := dockerCompose(clientComposeFile(name), "up", "-d"); err != nil {
		die("Failed to start %s: %v", name, err)
	}
	log("%s started", name)

	shipFrontendDist(name, distDir)
	log("Frontend shipped to %s", name)
}

// cmdStop stops a client's backend container.
func cmdStop(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}
	log("Stopping %s…", name)
	dockerComposeSilent(clientComposeFile(name), "down")
	log("%s stopped", name)
}

// cmdRemove permanently deletes a client after confirmation.
func cmdRemove(name string) {
	if !clientExists(name) {
		die("Client '%s' not found", name)
	}

	fmt.Printf("%sThis will permanently delete backends/%s/ and its uploads.%s\n", colorRed, name, colorReset)
	if !confirmPrompt(name) {
		die("Aborted")
	}

	if clientRunning(name) {
		dockerComposeSilent(clientComposeFile(name), "down")
	}

	dir := clientDir(name)
	if dir == "" || dir == "/" {
		die("Refusing to remove dangerous path")
	}
	if err := os.RemoveAll(dir); err != nil {
		// Likely root-owned files from Docker volume mounts.
		warn("Cannot remove as current user — retrying with sudo…")
		cmd := exec.Command("sudo", "rm", "-rf", dir)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			die("Cannot remove client directory: %v\n  Try: sudo rm -rf %s", err, dir)
		}
	}
	log("Client '%s' removed", name)

	generateNginxConfig()
	reloadNginxIfRunning()
}
