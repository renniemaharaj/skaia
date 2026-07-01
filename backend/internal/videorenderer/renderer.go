package videorenderer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
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

// RenderVideo invokes the videorenderer Node.js script in a per-render working
// directory. The returned cleanup function removes all temporary render files.
func RenderVideo(projectJSON []byte) (string, func(), error) {
	dir := videoRendererDir()
	scriptPath := filepath.Join(dir, "render.js")
	workDir, err := os.MkdirTemp("", "skaia-render-*")
	if err != nil {
		return "", nil, fmt.Errorf("failed to create render workspace: %w", err)
	}
	cleanup := func() {
		_ = os.RemoveAll(workDir)
	}
	if err := os.Symlink(filepath.Join(dir, "node_modules"), filepath.Join(workDir, "node_modules")); err != nil && !os.IsExist(err) {
		cleanup()
		return "", nil, fmt.Errorf("failed to prepare render dependencies: %w", err)
	}

	outFile := filepath.Join(workDir, fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano()))

	cmd := exec.Command("node", scriptPath, workDir, outFile)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "NODE_PATH="+filepath.Join(dir, "node_modules"))
	cmd.Stdin = bytes.NewReader(projectJSON)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("render script failed: %v\nStderr: %s", err, stderr.String())
	}

	var result RenderResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("failed to parse render result: %v\nStdout: %s", err, stdout.String())
	}

	if result.Status != "success" {
		cleanup()
		return "", nil, fmt.Errorf("render failed: %s", result.Message)
	}

	return result.File, cleanup, nil
}
