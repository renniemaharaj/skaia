package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
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
      - "8000:8000"
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

	fmt.Println("Waiting for Frappe GoFTW API to be ready on port 3000...")
	apiURL := "http://127.0.0.1:3000" // Running on host, so localhost works
	apiReady := false
	for i := 0; i < 60; i++ {
		resp, err := http.Get(apiURL + "/api/goftw/sites")
		if err == nil && resp.StatusCode == 200 {
			apiReady = true
			break
		}
		time.Sleep(2 * time.Second)
	}

	if !apiReady {
		die("Timed out waiting for Frappe GoFTW API to become ready")
	}

	fmt.Printf("Orchestrating new Frappe site via API: %s\n", siteName)

	payload := map[string]interface{}{
		"apps": []string{"frappe", "erpnext"},
	}
	bodyBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest("PUT", fmt.Sprintf("%s/api/goftw/site/%s", apiURL, siteName), bytes.NewBuffer(bodyBytes))
	if err != nil {
		die("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		die("API call failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 201 && resp.StatusCode != 200 {
		die("API returned status %d", resp.StatusCode)
	}

	fmt.Println("Frappe Framework multi-tenant site successfully provisioned via API and is now RUNNING.")
}
