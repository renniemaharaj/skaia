package ssh

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"goftw/internal/environ"
)

// Config holds SSH key configuration
type Config struct {
	AuthorizedKeysPath string
	PrivateKeyPath     string
}

// Setup initializes SSH key-based authentication for the frappe user
func Setup() error {
	homeDir := environ.GetFrappeHome()
	sshDir := filepath.Join(homeDir, ".ssh")

	// Create .ssh directory if it doesn't exist
	if err := os.MkdirAll(sshDir, 0700); err != nil {
		return fmt.Errorf("failed to create .ssh directory: %w", err)
	}

	// Set proper permissions
	if err := os.Chmod(sshDir, 0700); err != nil {
		return fmt.Errorf("failed to set .ssh permissions: %w", err)
	}

	authorizedKeysPath := filepath.Join(sshDir, "authorized_keys")
	sshKeyEnvVar := os.Getenv("SSH_PUBLIC_KEY")

	if sshKeyEnvVar == "" {
		fmt.Println("[SSH] SSH_PUBLIC_KEY not set, skipping SSH setup")
		return nil
	}

	// Write SSH public key to authorized_keys
	f, err := os.OpenFile(authorizedKeysPath, os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("failed to open authorized_keys: %w", err)
	}
	defer f.Close()

	// Clear existing content
	if err := f.Truncate(0); err != nil {
		return fmt.Errorf("failed to truncate authorized_keys: %w", err)
	}

	if _, err := io.WriteString(f, sshKeyEnvVar+"\n"); err != nil {
		return fmt.Errorf("failed to write SSH public key: %w", err)
	}

	// Set proper permissions
	if err := os.Chmod(authorizedKeysPath, 0600); err != nil {
		return fmt.Errorf("failed to set authorized_keys permissions: %w", err)
	}

	fmt.Println("[SSH] SSH public key configured successfully")
	return nil
}

// ValidateKeyPair checks if SSH key is properly configured
func ValidateKeyPair() bool {
	sshKeyEnvVar := os.Getenv("SSH_PUBLIC_KEY")
	return sshKeyEnvVar != ""
}
