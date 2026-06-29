package videorenderer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
)

// videoRendererDir returns the absolute path to the videorenderer directory.
func videoRendererDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Dir(file)
}

type RenderResult struct {
	Status  string `json:"status"`
	File    string `json:"file,omitempty"`
	Message string `json:"message,omitempty"`
}

// RenderVideo invokes the videorenderer Node.js script. Accepts a JSON byte slice.
func RenderVideo(projectJSON []byte) (string, error) {
	dir := videoRendererDir()
	scriptPath := filepath.Join(dir, "render.js")

	cmd := exec.Command("node", scriptPath)
	cmd.Dir = dir
	cmd.Stdin = bytes.NewReader(projectJSON)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("render script failed: %v\nStderr: %s", err, stderr.String())
	}

	var result RenderResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return "", fmt.Errorf("failed to parse render result: %v\nStdout: %s", err, stdout.String())
	}

	if result.Status != "success" {
		return "", fmt.Errorf("render failed: %s", result.Message)
	}

	return result.File, nil
}
