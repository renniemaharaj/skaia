package provisioning

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"github.com/renniemaharaj/grouplogs/pkg/logger"
)

// SupersetProvisionWorker handles the deployment strategy for Superset.
// It creates a single-tenant instance, dynamically injects the environment and credentials,
// and executes the bootstrap commands.
func SupersetProvisionWorker(instanceID int64, configPayload []byte, l *logger.Logger) error {
	var config struct {
		Port     int    `json:"port"`
		GCPKey   string `json:"gcp_key"`
		Postgres struct {
			Host     string `json:"host"`
			Port     int    `json:"port"`
			User     string `json:"user"`
			Password string `json:"password"`
			DBName   string `json:"db_name"`
		} `json:"postgres"`
		Redis struct {
			Host string `json:"host"`
			Port int    `json:"port"`
		} `json:"redis"`
		Admin struct {
			Username  string `json:"username"`
			Password  string `json:"password"`
			Email     string `json:"email"`
			Firstname string `json:"firstname"`
			Lastname  string `json:"lastname"`
		} `json:"admin"`
	}

	// For simulation/stubbing if payload is empty, we don't panic.
	if len(configPayload) > 0 {
		if err := json.Unmarshal(configPayload, &config); err != nil {
			return fmt.Errorf("failed to parse superset config payload: %w", err)
		}
	} else {
		config.Admin.Username = "admin"
		config.Admin.Password = "admin"
	}

	l.Info("Creating a single-tenant instance directory to isolate the environment...")
	// 1. Create a single-tenant instance directory to isolate the environment
	instanceDir := fmt.Sprintf("/tmp/skaia/superset/instance_%d", instanceID)
	if err := os.MkdirAll(instanceDir, 0755); err != nil {
		l.ErrorF("failed to create instance dir: %v", err)
		return fmt.Errorf("failed to create instance dir: %w", err)
	}

	l.Info("Injecting GCP_KEY securely...")
	// 2. Inject GCP_KEY securely
	gcpKeyPath := filepath.Join(instanceDir, "gcp-key.json")
	if config.GCPKey != "" {
		if err := os.WriteFile(gcpKeyPath, []byte(config.GCPKey), 0600); err != nil {
			l.ErrorF("failed to write GCP key: %v", err)
			return fmt.Errorf("failed to write GCP key: %w", err)
		}
	}

	l.Info("Injecting Environment variables dynamically...")
	// 3. Inject Environment variables dynamically
	envContent := fmt.Sprintf(`
SUPERSET_ADMIN_USERNAME=%s
SUPERSET_ADMIN_PASSWORD=%s
SUPERSET_ADMIN_EMAIL=%s
SUPERSET_ADMIN_FIRSTNAME=%s
SUPERSET_ADMIN_LASTNAME=%s
DATABASE_HOST=%s
DATABASE_PORT=%d
DATABASE_USER=%s
DATABASE_PASSWORD=%s
DATABASE_DB=%s
REDIS_HOST=%s
REDIS_PORT=%d
`, config.Admin.Username, config.Admin.Password, config.Admin.Email, config.Admin.Firstname, config.Admin.Lastname,
		config.Postgres.Host, config.Postgres.Port, config.Postgres.User, config.Postgres.Password, config.Postgres.DBName,
		config.Redis.Host, config.Redis.Port)

	envPath := filepath.Join(instanceDir, ".env")
	if err := os.WriteFile(envPath, []byte(envContent), 0600); err != nil {
		l.ErrorF("failed to write env file: %v", err)
		return fmt.Errorf("failed to write env file: %w", err)
	}


	port := 8088
	if config.Port > 0 {
		port = config.Port
	}

	l.Info("Writing docker-compose.yml for Superset...")
	// Write a basic docker-compose.yml
	composeContent := `
services:
  superset:
    image: apache/superset:latest
    container_name: skaia_superset_` + fmt.Sprintf("%d", instanceID) + `
    ports:
      - "` + fmt.Sprintf("%d", port) + `:8088"
    env_file:
      - .env
    command: ["/app/docker/docker-bootstrap.sh", "app-gunicorn"]
`
	composePath := filepath.Join(instanceDir, "docker-compose.yml")
	if err := os.WriteFile(composePath, []byte(composeContent), 0644); err != nil {
		l.ErrorF("failed to write docker-compose.yml: %v", err)
		return fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}

	// 4. Build the one-time bootstrap initialization.
	l.InfoF("Starting single-tenant container via docker-compose using %s...", envPath)
	
	upCmd := exec.Command("docker", "compose", "up", "-d")
	upCmd.Dir = instanceDir
	if err := streamCommand(upCmd, l); err != nil {
		l.ErrorF("docker compose up failed: %v", err)
		return err
	}

	bootstrapCmds := []string{
		"superset db upgrade",
		fmt.Sprintf("superset fab create-admin --username %s --password %s --email %s --firstname %s --lastname %s",
			config.Admin.Username, config.Admin.Password, config.Admin.Email, config.Admin.Firstname, config.Admin.Lastname),
		"superset init",
	}

	containerName := fmt.Sprintf("skaia_superset_%d", instanceID)
	
	for _, bCmd := range bootstrapCmds {
		l.InfoF("Executing Bootstrap: docker exec %s %s", containerName, bCmd)
		
		// parse bCmd string into args for exec
		// For simplicity, we wrap it in sh -c
		cmd := exec.Command("docker", "exec", containerName, "sh", "-c", bCmd)
		if err := streamCommand(cmd, l); err != nil {
			l.ErrorF("Bootstrap command failed: %v", err)
			return err
		}
	}

	l.Success("Superset single-tenant instance successfully provisioned and is now RUNNING.")
	return nil
}
