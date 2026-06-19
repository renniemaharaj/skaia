package app

import (
	"os"
	"os/exec"
	"path/filepath"
)

func cmdComposeUp(follow bool, build bool) {
	loadSharedEnv()

	// 1) Optionally build backend image
	if build {
		cmdBuild()
	} else {
		ensureImage()
	}

	// 2) Start shared infrastructure (postgres + redis)
	log("Starting shared infrastructure…")
	if err := dockerCompose(composeFile(), "up", "-d", "postgres", "redis"); err != nil {
		die("Failed to start shared infrastructure: %v", err)
	}

	waitForHealthy("skaia-postgres", 60)
	waitForHealthy("skaia-redis", 60)

	// 3) Ensure network exists for client composes
	ensureNetwork()

	// 4) Init DBs + start enabled backends
	started := 0
	entries, _ := os.ReadDir(backendsDir())
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(backendsDir(), e.Name())
		if _, err := os.Stat(filepath.Join(dir, ".disabled")); err == nil {
			continue
		}
		envFile := filepath.Join(dir, ".env")
		if _, err := os.Stat(envFile); err != nil {
			continue
		}

		cname := envVal(envFile, "CLIENT_NAME")
		if cname == "" {
			continue
		}

		// Init DB if needed (ignore errors - DB may already exist)
		cmdDBInit(cname)

		log("Starting %s…", cname)
		if err := dockerCompose(filepath.Join(dir, "compose.yml"), "up", "-d"); err != nil {
			warn("Failed to start %s: %v", cname, err)
			continue
		}
		started++
	}

	if started == 0 {
		warn("No enabled clients found. Create one with: grengo new <name>")
	}

	// 5) Generate nginx config + start nginx
	generateNginxConfig()
	if err := dockerCompose(composeFile(), "up", "-d", "nginx"); err != nil {
		die("Failed to start nginx: %v", err)
	}
	log("All services started (%d client(s))", started)

	if follow {
		log("Following logs (ctrl-c to stop)…")
		if err := dockerComposeLogs(composeFile(), "--follow", "--tail", "100"); err != nil {
			warn("Log follow ended with error: %v", err)
		}
	}
}

// cmdComposeDown stops all client backends and shared infrastructure.
func cmdComposeDown() {
	// Stop all client backends
	entries, _ := os.ReadDir(backendsDir())
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		cf := filepath.Join(backendsDir(), e.Name(), "compose.yml")
		if _, err := os.Stat(cf); err == nil {
			dockerComposeSilent(cf, "down")
		}
	}

	// Stop shared infra
	if err := dockerCompose(composeFile(), "down"); err != nil {
		die("Failed to stop shared infrastructure: %v", err)
	}
	log("All services stopped")
}

func cmdGlobalStart() {
	log("Stashing current changes...")
	cmdStash := exec.Command("git", "stash")
	cmdStash.Dir = ProjectRoot()
	cmdStash.Stdout = os.Stdout
	cmdStash.Stderr = os.Stderr
	cmdStash.Run() // ignore error, might not be any changes to stash

	log("Pulling latest changes...")
	cmdPull := exec.Command("git", "pull", "--rebase")
	cmdPull.Dir = ProjectRoot()
	cmdPull.Stdout = os.Stdout
	cmdPull.Stderr = os.Stderr
	if err := cmdPull.Run(); err != nil {
		die("git pull failed: %v", err)
	}

	log("Popping stashed changes...")
	cmdPop := exec.Command("git", "stash", "pop")
	cmdPop.Dir = ProjectRoot()
	cmdPop.Stdout = os.Stdout
	cmdPop.Stderr = os.Stderr
	cmdPop.Run() // ignore error, might not be any stashed changes

	log("Starting all services...")
	cmdComposeUp(false, true)
}

func cmdGlobalStop() {
	cmdComposeDown()
}

func cmdGlobalRestart() {
	cmdGlobalStart()
}

