package app

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const maxFrappeSitesPerCluster = 50

type frappeVersionSpec struct {
	ID          string
	Branch      string
	ComposeFile string
}

func frappeVersion(version string) (frappeVersionSpec, error) {
	switch strings.ToLower(strings.TrimSpace(version)) {
	case "", "16", "version-16":
		return frappeVersionSpec{
			ID:          "16",
			Branch:      "version-16",
			ComposeFile: "compose.v16.yml",
		}, nil
	case "15", "version-15":
		return frappeVersionSpec{
			ID:          "15",
			Branch:      "version-15",
			ComposeFile: "compose.v15.yml",
		}, nil
	case "17", "17-dev", "dev", "develop":
		return frappeVersionSpec{
			ID:          "17-dev",
			Branch:      "develop",
			ComposeFile: "compose.v17-dev.yml",
		}, nil
	default:
		return frappeVersionSpec{}, fmt.Errorf("unsupported Frappe version %q; use 15, 16, or 17-dev", version)
	}
}

func cmdFrappeProvision(siteName string, version string) {
	spec, err := frappeVersion(version)
	if err != nil {
		die("%v", err)
	}

	fmt.Printf("Ensuring Frappe %s cluster is running...\n", spec.ID)

	ensureNetwork()

	clusterID := 1
	clusterDir := filepath.Join("/tmp/skaia/frappe", fmt.Sprintf("cluster_%s_%d", strings.ReplaceAll(spec.ID, "-", "_"), clusterID))
	if err := os.MkdirAll(clusterDir, 0755); err != nil {
		die("failed to create cluster dir: %v", err)
	}
	metaPath := filepath.Join(clusterDir, "sites.json")
	var sites []string
	if data, err := os.ReadFile(metaPath); err == nil {
		_ = json.Unmarshal(data, &sites)
	}
	for len(sites) >= maxFrappeSitesPerCluster {
		clusterID++
		clusterDir = filepath.Join("/tmp/skaia/frappe", fmt.Sprintf("cluster_%s_%d", strings.ReplaceAll(spec.ID, "-", "_"), clusterID))
		if err := os.MkdirAll(clusterDir, 0755); err != nil {
			die("failed to create cluster dir: %v", err)
		}
		metaPath = filepath.Join(clusterDir, "sites.json")
		sites = nil
		if data, err := os.ReadFile(metaPath); err == nil {
			_ = json.Unmarshal(data, &sites)
		}
	}

	projectRoot := ProjectRoot()
	frappeContext := filepath.Join(projectRoot, "pkg", "frappe")
	if _, err := os.Stat(filepath.Join(frappeContext, "Dockerfile")); err != nil {
		die("Frappe Docker build context not found at %s: %v", frappeContext, err)
	}
	templatePath := filepath.Join(frappeContext, spec.ComposeFile)
	if _, err := os.Stat(templatePath); err != nil {
		die("Frappe compose template not found at %s: %v", templatePath, err)
	}

	httpPort := 8000 + (clusterID - 1) + versionPortOffset(spec.ID)
	grpcPort := 3001 + (clusterID - 1) + versionPortOffset(spec.ID)

	instanceConfig := map[string]any{
		"deployment":           "production",
		"server_name":          "localhost",
		"instance_sites":       []any{},
		"drop_abandoned_sites": false,
		"run_sites_manager":    true,
		"frappe_branch":        spec.Branch,
	}
	instanceBytes, _ := json.MarshalIndent(instanceConfig, "", "  ")
	instancePath := filepath.Join(clusterDir, "instance.json")
	if err := os.WriteFile(instancePath, instanceBytes, 0644); err != nil {
		die("failed to write instance.json: %v", err)
	}

	composePath := filepath.Join(clusterDir, "docker-compose.yml")
	safeVersion := strings.ReplaceAll(spec.ID, "-", "_")
	formattedCompose, err := renderFrappeCompose(templatePath, frappeContext, instancePath, safeVersion, clusterID, httpPort, grpcPort)
	if err != nil {
		die("failed to render %s: %v", spec.ComposeFile, err)
	}
	if err := os.WriteFile(composePath, []byte(formattedCompose), 0644); err != nil {
		die("failed to write docker-compose.yml: %v", err)
	}

	fmt.Printf("Starting Frappe %s cluster %d via docker compose (idempotent)...\n", spec.ID, clusterID)
	upCmd := exec.Command("docker", "compose", "-f", composePath, "up", "-d", "--build")
	upCmd.Dir = clusterDir
	upCmd.Stdout = os.Stdout
	upCmd.Stderr = os.Stderr
	if err := upCmd.Run(); err != nil {
		die("docker compose up failed: %v", err)
	}

	grpcFrappeProvision(siteName, spec.Branch, grpcPort)

	if !stringSliceContains(sites, siteName) {
		sites = append(sites, siteName)
		if data, err := json.MarshalIndent(sites, "", "  "); err == nil {
			_ = os.WriteFile(metaPath, data, 0644)
		}
	}
	if err := newGrengoService().RecordFrappeAllocation(frappeAllocation{
		Version:      spec.ID,
		Branch:       spec.Branch,
		ClusterIndex: clusterID,
		HTTPPort:     httpPort,
		GRPCPort:     grpcPort,
		SiteName:     siteName,
	}); err != nil {
		warn("failed to record Frappe allocation in grengo DB: %v", err)
	}
	fmt.Printf("FRAPPE_CLUSTER_VERSION=%s\nFRAPPE_CLUSTER_ID=%d\nFRAPPE_HTTP_PORT=%d\nFRAPPE_GRPC_PORT=%d\n", spec.ID, clusterID, httpPort, grpcPort)
}

func versionPortOffset(version string) int {
	switch version {
	case "15":
		return 150
	case "16":
		return 160
	case "17-dev":
		return 170
	default:
		return 190
	}
}

func stringSliceContains(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func renderFrappeCompose(templatePath, frappeContext, instancePath, safeVersion string, clusterID, httpPort, grpcPort int) (string, error) {
	data, err := os.ReadFile(templatePath)
	if err != nil {
		return "", err
	}
	replacer := strings.NewReplacer(
		"__FRAPPE_CONTEXT__", frappeContext,
		"__INSTANCE_PATH__", instancePath,
		"__SAFE_VERSION__", safeVersion,
		"__CLUSTER_ID__", fmt.Sprintf("%d", clusterID),
		"__HTTP_PORT__", fmt.Sprintf("%d", httpPort),
		"__GRPC_PORT__", fmt.Sprintf("%d", grpcPort),
	)
	return replacer.Replace(string(data)), nil
}

func cmdFrappeRebuild() {
	frappeBaseDir := "/tmp/skaia/frappe"
	entries, err := os.ReadDir(frappeBaseDir)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Println("No Frappe clusters found.")
			return
		}
		die("failed to read frappe clusters dir: %v", err)
	}

	found := false
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		clusterDir := filepath.Join(frappeBaseDir, entry.Name())
		composePath := filepath.Join(clusterDir, "docker-compose.yml")
		if _, err := os.Stat(composePath); err == nil {
			found = true
			fmt.Printf("Rebuilding Frappe cluster: %s...\n", entry.Name())
			buildCmd := exec.Command("docker", "compose", "-f", composePath, "build", "--no-cache")
			buildCmd.Dir = clusterDir
			buildCmd.Stdout = os.Stdout
			buildCmd.Stderr = os.Stderr
			if err := buildCmd.Run(); err != nil {
				die("docker compose build failed for %s: %v", entry.Name(), err)
			}

			fmt.Printf("Restarting Frappe cluster: %s...\n", entry.Name())
			upCmd := exec.Command("docker", "compose", "-f", composePath, "up", "-d", "--force-recreate")
			upCmd.Dir = clusterDir
			upCmd.Stdout = os.Stdout
			upCmd.Stderr = os.Stderr
			if err := upCmd.Run(); err != nil {
				die("docker compose up failed for %s: %v", entry.Name(), err)
			}
		}
	}

	if !found {
		fmt.Println("No Frappe clusters found to rebuild.")
	} else {
		fmt.Println("All Frappe clusters rebuilt successfully.")
	}
}
