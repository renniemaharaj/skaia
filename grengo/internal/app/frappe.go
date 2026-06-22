package app

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func cmdFrappeProvision(siteName string) {
	fmt.Println("Ensuring global Frappe cluster is running...")

	clusterDir := "/tmp/skaia/frappe/cluster_1"
	if err := os.MkdirAll(clusterDir, 0755); err != nil {
		die("failed to create cluster dir: %v", err)
	}

	composeContent := `
services:
  mariadb:
    image: mariadb:11
    container_name: skaia_frappe_mariadb
    environment:
      MARIADB_ROOT_PASSWORD: root
      MARIADB_USER: frappe
      MARIADB_PASSWORD: frappe
      MARIADB_DATABASE: frappe

  redis:
    image: redis:7-alpine
    container_name: skaia_frappe_redis

  frappe:
    build: %s/backend/pkg/frappe
    container_name: skaia_frappe_cluster_1
    ports:
      - "8000:80"
      - "3000:3000"
    environment:
      MARIADB_HOST: mariadb
      MARIADB_PORT: 3306
      MARIADB_ROOT_USERNAME: root
      MARIADB_ROOT_PASSWORD: root
      REDIS_CACHE: redis://redis:6379
      REDIS_QUEUE: redis://redis:6379
      REDIS_SOCKETIO: redis://redis:6379
      WAIT_FOR_DB: 1
      WAIT_FOR_REDIS: 1
    depends_on:
      - mariadb
      - redis
    networks:
      - default
      - skaia-network

networks:
  skaia-network:
    external: true
`
	composePath := filepath.Join(clusterDir, "docker-compose.yml")
	formattedCompose := fmt.Sprintf(composeContent, ProjectRoot())
	if err := os.WriteFile(composePath, []byte(formattedCompose), 0644); err != nil {
		die("failed to write docker-compose.yml: %v", err)
	}

	fmt.Println("Starting Frappe ERPNext global cluster via docker compose (idempotent)...")
	upCmd := exec.Command("docker", "compose", "-f", composePath, "up", "-d", "--build")
	upCmd.Dir = clusterDir
	if out, err := upCmd.CombinedOutput(); err != nil {
		die("docker compose up failed: %v\n%s", err, string(out))
	}

	grpcFrappeProvision(siteName)
}
