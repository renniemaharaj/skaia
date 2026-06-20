package bench

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"goftw/internal/environ"
	internalExec "goftw/internal/fns"
	"goftw/internal/whoiam"
)

// The structure of a branch type
type Bench struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Branch     string `json:"branch"`
	ServerName string `json:"server_name"`
}

// CopyCommonSitesConfig ensures sites/ exists and copies common_sites_config.json
func (b *Bench) CopyCommonSitesConfig() error {
	sitesPath := filepath.Join(b.Path, "sites")

	// Ensure sites directory exists
	if _, err := os.Stat(sitesPath); os.IsNotExist(err) {
		fmt.Printf("[INFO] Sites directory %s does not exist, creating...\n", sitesPath)
		if err := os.MkdirAll(sitesPath, 0755); err != nil {
			fmt.Printf("[WARN] Could not create sites directory without sudo: %v\n", err)
			if err := internalExec.ExecRunPrintIO("sudo", "mkdir", "-p", sitesPath); err != nil {
				return fmt.Errorf("failed to create sites directory even with sudo: %w", err)
			}
		}
	}

	// Ensure ownership of sites directory
	if err := internalExec.ExecRunPrintIO("sudo", "chown", "-R",
		fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid()), sitesPath); err != nil {
		// return fmt.Errorf("failed to chown sites directory: %w", err)
		fmt.Printf("[Warn] Failed to chown existing: %s", sitesPath)
	}

	// Copy common_sites_config.json
	configPath := environ.GetCommonSitesConfigPath()
	dest := sitesPath
	if err := internalExec.ExecRunPrintIO("cp", configPath, dest); err != nil {
		return fmt.Errorf("copy %s -> %s: %w", configPath, dest, err)
	}

	fmt.Printf("[Patch] Successfully copied custom common_site_config to %s", sitesPath)
	return nil
}

// Initialize initializes a new bench with the given name and frappe branch
func (b *Bench) Initialize(frappeBranch string) error {
	homeDir := environ.GetFrappeHome()
	benchPath := b.Path // already includes homeDir

	// Ensure parent exists
	if _, err := os.Stat(homeDir); os.IsNotExist(err) {
		fmt.Printf("[INFO] Parent directory %s does not exist, creating...\n", homeDir)
		if err := os.MkdirAll(homeDir, 0755); err != nil {
			fmt.Printf("[WARN] Could not create directory without sudo: %v\n", err)
			if err := internalExec.ExecRunPrintIO("sudo", "mkdir", "-p", homeDir); err != nil {
				return fmt.Errorf("[ERROR] Failed to create parent directory even with sudo: %w", err)
			}
		}
	}

	// Ensure ownership of homeDir
	if err := internalExec.ExecRunPrintIO("sudo", "chown", "-R",
		fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid()), homeDir); err != nil {
		return fmt.Errorf("failed to chown parent directory: %w", err)
	}

	// Run bench init
	cmd := fmt.Sprintf("bench init --frappe-branch %s %s", frappeBranch, benchPath)
	if err := whoiam.ExecRunPrintIO("sh", "-c", cmd); err != nil {
		return fmt.Errorf("[ERROR] Bench initialization failed: %w", err)
	}

	// Copy common_sites_config.json into sites/
	if err := b.CopyCommonSitesConfig(); err != nil {
		return fmt.Errorf("[ERROR] Failed to copy common sites config: %w", err)
	}

	fmt.Printf("[INFO] Bench '%s' initialized successfully\n", b.Path)
	return nil
}

// ExecRunInBenchSwallowIO executes a bench command inside the bench directory and returns its output.
func (b *Bench) ExecRunInBenchSwallowIO(args ...string) ([]byte, error) {
	// Directly run bench with Dir set to benchDir
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = b.Path
	cmd.Env = os.Environ() // inherit environment variables

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("bench failed: %s, stderr: %s", err, stderr.String())
	}

	return out.Bytes(), nil
}

// ExecRunInBenchPrintIO executes a bench command inside the bench directory and prints its output.
func (b *Bench) ExecRunInBenchPrintIO(args ...string) error {
	// Directly run bench with Dir set to benchDir
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = b.Path
	cmd.Env = os.Environ() // inherit environment variables

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("bench failed: %v", err)
	}

	return nil
}

// ExecStartInBenchPrintIO executes a bench command inside the bench directory, with stdio printing,
// but will not wait nor block
func (b *Bench) ExecStartInBenchPrintIO(args ...string) (*exec.Cmd, error) {
	// Directly run bench with Dir set to benchDir
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = b.Path
	cmd.Env = os.Environ() // inherit environment variables

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Start()
	if err != nil {
		return nil, fmt.Errorf("bench failed: %v", err)
	}

	return cmd, nil
}
