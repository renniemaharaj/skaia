package app

import (
	"os"
	"os/exec"
	"path/filepath"
)

func cmdBuild() {
	log("Building %s from %s …", Image(), backendSrc())
	if err := dockerRun("build", "-t", Image(), backendSrc()); err != nil {
		die("Build failed: %v", err)
	}
	log("Image %s built", Image())
}

// cmdRebuildFrontend builds the SPA once and hot-copies it into running backend containers.
func cmdRebuildFrontend(target string) {
	if target == "" {
		target = "all"
	}

	frontendDir := filepath.Join(ProjectRoot(), "backend", "frontend")
	distDir := filepath.Join(frontendDir, "dist")
	if _, err := os.Stat(filepath.Join(frontendDir, "package.json")); err != nil {
		die("Frontend package not found in %s: %v", frontendDir, err)
	}

	log("Building frontend from %s …", frontendDir)
	cmd := exec.Command("npm", "run", "build")
	cmd.Dir = frontendDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Run(); err != nil {
		die("Frontend build failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(distDir, "index.html")); err != nil {
		die("Frontend build did not produce %s: %v", filepath.Join(distDir, "index.html"), err)
	}

	targets := frontendRebuildTargets(target)
	if len(targets) == 0 {
		die("No running backend containers found to update")
	}

	for _, name := range targets {
		shipFrontendDist(name, distDir)
	}
	log("Frontend shipped to %d backend(s) without restarting containers", len(targets))
}

func frontendRebuildTargets(target string) []string {
	if target != "all" {
		if !clientExists(target) {
			die("Client '%s' not found", target)
		}
		name := envVal(clientEnvFile(target), "CLIENT_NAME")
		if name == "" {
			name = target
		}
		if !clientRunning(name) {
			die("Client '%s' is not running; start it before shipping frontend assets", name)
		}
		return []string{name}
	}

	entries, err := os.ReadDir(backendsDir())
	if err != nil {
		die("Cannot read backends directory: %v", err)
	}

	var targets []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		envFile := filepath.Join(backendsDir(), e.Name(), ".env")
		if _, err := os.Stat(envFile); err != nil {
			continue
		}
		name := envVal(envFile, "CLIENT_NAME")
		if name == "" {
			name = e.Name()
		}
		if !clientRunning(name) {
			warn("Skipping %s; backend container is not running", name)
			continue
		}
		targets = append(targets, name)
	}
	return targets
}

func shipFrontendDist(name, distDir string) {
	container := name + "-backend"
	dest := "/app/frontend/dist"

	log("Shipping frontend assets to %s …", container)
	if err := dockerRun("exec", container, "mkdir", "-p", dest); err != nil {
		die("Failed to prepare %s:%s: %v", container, dest, err)
	}
	if err := dockerRun("cp", distDir+string(os.PathSeparator)+".", container+":"+dest); err != nil {
		die("Failed to copy frontend assets to %s: %v", container, err)
	}
	if err := dockerRun("exec", container, "chown", "-R", "appuser:appuser", dest); err != nil {
		warn("Copied assets to %s, but ownership update failed: %v", container, err)
	}
	log("Updated %s", container)
}
