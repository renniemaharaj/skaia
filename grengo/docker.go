package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// dockerRun executes a docker command, inheriting stdout/stderr.
func dockerRun(args ...string) error {
	cmd := exec.Command("docker", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// dockerRunSilent executes a docker command, suppressing output.
func dockerRunSilent(args ...string) error {
	return exec.Command("docker", args...).Run()
}

// dockerOutput executes a docker command and returns its stdout.
func dockerOutput(args ...string) (string, error) {
	out, err := exec.Command("docker", args...).Output()
	return strings.TrimSpace(string(out)), err
}

// dockerExec runs a command inside a running container, inheriting stdout/stderr.
func dockerExec(container string, args ...string) error {
	cmdArgs := append([]string{"exec", container}, args...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// dockerExecInput runs a command inside a container with piped stdin.
func dockerExecInput(container string, input []byte, args ...string) error {
	cmdArgs := append([]string{"exec", "-i", container}, args...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Stdin = strings.NewReader(string(input))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// dockerExecOutput runs a command inside a container and returns stdout.
func dockerExecOutput(container string, args ...string) (string, error) {
	cmdArgs := append([]string{"exec", container}, args...)
	out, err := exec.Command("docker", cmdArgs...).Output()
	return strings.TrimSpace(string(out)), err
}

// dockerCompose runs docker compose with the given compose file and arguments.
func dockerCompose(composeFile string, args ...string) error {
	cmdArgs := append([]string{"compose", "-f", composeFile}, args...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// dockerComposeSilent runs docker compose suppressing output.
func dockerComposeSilent(composeFile string, args ...string) error {
	cmdArgs := append([]string{"compose", "-f", composeFile}, args...)
	return exec.Command("docker", cmdArgs...).Run()
}

// dockerComposeLogs runs docker compose logs, passing extra flags.
func dockerComposeLogs(composeFile string, extraArgs ...string) error {
	cmdArgs := append([]string{"compose", "-f", composeFile, "logs"}, extraArgs...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// containerRunning checks if a container with the given name is running.
func containerRunning(name string) bool {
	out, err := dockerOutput("ps", "--format", "{{.Names}}")
	if err != nil {
		return false
	}
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) == name {
			return true
		}
	}
	return false
}

// clientRunning checks if a client's backend container is running.
func clientRunning(name string) bool {
	return containerRunning(name + "-backend")
}

// imageExists checks if a Docker image exists locally.
func imageExists(image string) bool {
	return dockerRunSilent("image", "inspect", image) == nil
}

// networkExists checks if a Docker network exists.
func networkExists(name string) bool {
	return dockerRunSilent("network", "inspect", name) == nil
}

// ensureImage builds the backend image if it doesn't exist.
func ensureImage() {
	if !imageExists(Image()) {
		warn("Image %s not found – building…", Image())
		cmdBuild()
	}
}

// ensureNetwork creates the Docker network if it doesn't exist.
func ensureNetwork() {
	if !networkExists(NetworkName) {
		if err := dockerRunSilent("network", "create", NetworkName); err != nil {
			die("Failed to create network %s: %v", NetworkName, err)
		}
	}
}

// waitForHealthy polls a container's health status until it reports healthy.
func waitForHealthy(container string, timeout int) {
	if timeout <= 0 {
		timeout = 60
	}
	info("Waiting for %s to be healthy…", container)
	for i := 0; i < timeout; i++ {
		status, err := dockerOutput("inspect", "--format", "{{.State.Health.Status}}", container)
		if err == nil && status == "healthy" {
			return
		}
		time.Sleep(1 * time.Second)
	}
	die("%s did not become healthy within %ds", container, timeout)
}

// pgRunning checks if the shared PostgreSQL container is running.
func pgRunning() bool {
	return containerRunning("skaia-postgres")
}

// dbExists checks if a database exists in the shared PostgreSQL.
func dbExists(dbName string, env SharedEnv) bool {
	query := fmt.Sprintf("SELECT 1 FROM pg_database WHERE datname='%s'", dbName)
	out, err := dockerExecOutput("skaia-postgres", "psql", "-U", env.PostgresUser, "-d", "template1", "-tAc", query)
	return err == nil && strings.TrimSpace(out) == "1"
}

// reloadNginxIfRunning sends a reload signal to nginx if its container is up.
func reloadNginxIfRunning() {
	if containerRunning("skaia-nginx") {
		if err := dockerRunSilent("exec", "skaia-nginx", "nginx", "-s", "reload"); err != nil {
			warn("nginx reload failed – you may need to restart it")
		} else {
			log("nginx reloaded")
		}
	}
}
