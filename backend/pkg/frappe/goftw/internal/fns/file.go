package fns

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
)

// RemoveFile removes a file using sudo (ignores "file not found").
func RemoveFile(path string) error {
	cmd := exec.Command("sudo", "rm", "-f", path)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to remove file %s: %v", path, err)
	}
	return nil
}

// RemoveDirectory removes a directory and all its contents using sudo.
func RemoveDirectory(path string) error {
	cmd := exec.Command("sudo", "rm", "-rf", path)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to remove directory %s: %v", path, err)
	}
	return nil
}

// ReadFile reads the content of a file that may require sudo privileges.
func ReadFile(path string) ([]byte, error) {
	cmd := exec.Command("sudo", "cat", path)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to read file with sudo: %v", err)
	}
	return out.Bytes(), nil
}
