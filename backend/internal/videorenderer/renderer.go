package videorenderer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const defaultRenderTimeout = 10 * time.Minute

var chromiumExecutableCandidates = []string{
	"/usr/bin/chromium-browser",
	"/usr/bin/chromium",
	"/usr/bin/google-chrome",
	"/usr/bin/google-chrome-stable",
}

func videoRendererDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Dir(file)
}

type RenderResult struct {
	Status  string `json:"status"`
	File    string `json:"file,omitempty"`
	Message string `json:"message,omitempty"`
	Stack   string `json:"stack,omitempty"`
}

func RenderVideo(projectJSON []byte) (string, func(), error) {
	timeout := renderTimeout()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	dir := videoRendererDir()
	scriptPath := filepath.Join(dir, "render.js")

	workDir, err := os.MkdirTemp("", "skaia-render-*")
	if err != nil {
		return "", nil, fmt.Errorf("failed to create render workspace: %w", err)
	}

	cleanup := func() {
		_ = os.RemoveAll(workDir)
	}

	outFile := filepath.Join(workDir, fmt.Sprintf("clip-%d.mp4", time.Now().UnixNano()))

	cmd := exec.CommandContext(ctx, "node", scriptPath, workDir, outFile)
	cmd.Dir = workDir
	cmd.Env = rendererEnv(dir, workDir)
	cmd.Stdin = bytes.NewReader(projectJSON)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			killProcessGroup(cmd.Process)
			cleanup()
			return "", nil, fmt.Errorf(
				"render timed out after %s\nstdout:\n%s\nstderr:\n%s",
				timeout,
				stdout.String(),
				stderr.String(),
			)
		}

		cleanup()
		return "", nil, fmt.Errorf(
			"render script failed: %w\nstdout:\n%s\nstderr:\n%s",
			err,
			stdout.String(),
			stderr.String(),
		)
	}

	result, err := parseRenderResult(stdout.String())
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf(
			"failed to parse render result: %w\nstdout:\n%s\nstderr:\n%s",
			err,
			stdout.String(),
			stderr.String(),
		)
	}

	if result.Status != "success" {
		cleanup()

		msg := result.Message
		if result.Stack != "" {
			msg += "\n" + result.Stack
		}

		return "", nil, fmt.Errorf(
			"render failed: %s\nstderr:\n%s",
			msg,
			stderr.String(),
		)
	}

	if result.File == "" {
		cleanup()
		return "", nil, fmt.Errorf("renderer returned success without output file")
	}

	if _, err := os.Stat(result.File); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("renderer output missing: %s: %w", result.File, err)
	}

	return result.File, cleanup, nil
}

func renderTimeout() time.Duration {
	value := strings.TrimSpace(os.Getenv("SKAIA_RENDER_TIMEOUT_SECONDS"))
	if value == "" {
		return defaultRenderTimeout
	}

	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return defaultRenderTimeout
	}

	return time.Duration(seconds) * time.Second
}

func killProcessGroup(process *os.Process) {
	if process == nil {
		return
	}

	_ = syscall.Kill(-process.Pid, syscall.SIGKILL)
}

func parseRenderResult(stdout string) (RenderResult, error) {
	var result RenderResult

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}

		if err := json.Unmarshal([]byte(line), &result); err == nil {
			return result, nil
		}
	}

	return result, fmt.Errorf("no JSON result found")
}

func rendererEnv(rendererDir, workDir string) []string {
	env := append(os.Environ(),
		"NODE_PATH="+filepath.Join(rendererDir, "node_modules"),
		"TMPDIR="+filepath.Join(workDir, "tmp"),
		"TEMP="+filepath.Join(workDir, "tmp"),
		"TMP="+filepath.Join(workDir, "tmp"),
	)

	if executableFile(os.Getenv("PUPPETEER_EXECUTABLE_PATH")) {
		return env
	}

	if path := chromiumExecutablePath(); path != "" {
		env = append(env, "PUPPETEER_EXECUTABLE_PATH="+path)
	}

	return env
}

func chromiumExecutablePath() string {
	for _, path := range chromiumExecutableCandidates {
		if executableFile(path) {
			return path
		}
	}

	for _, name := range []string{"chromium-browser", "chromium", "google-chrome", "google-chrome-stable"} {
		if path, err := exec.LookPath(name); err == nil && executableFile(path) {
			return path
		}
	}

	return ""
}

func executableFile(path string) bool {
	if path == "" {
		return false
	}

	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}

	return info.Mode()&0111 != 0
}
