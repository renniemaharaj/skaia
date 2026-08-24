package datasource

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

var nodeVersionOnce sync.Once
var nodeMajor int
var nodeMinor int
var nodeVersionErr error

// Diagnostic is a single TypeScript compiler diagnostic.
type Diagnostic struct {
	File     string `json:"file"`
	Line     int    `json:"line"`
	Col      int    `json:"col"`
	Message  string `json:"message"`
	Category int    `json:"category"` // 0=Warning, 1=Error, 2=Suggestion, 3=Message
}

// CompileResult holds the output of a TypeScript compilation.
type CompileResult struct {
	JS          string       `json:"js"`
	Diagnostics []Diagnostic `json:"diagnostics"`
	Cached      bool         `json:"cached,omitempty"`
}

// tsRunnerDir returns the absolute path to the tsrunner directory.
func tsRunnerDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "tsrunner")
}

// CompileTypeScript compiles TypeScript source files to JavaScript by invoking
// the tsrunner Node.js script. Accepts a map of filename=>content.
func CompileTypeScript(files map[string]string) (*CompileResult, error) {
	dir := tsRunnerDir()
	scriptPath := filepath.Join(dir, "compile.js")

	input := struct {
		Files map[string]string `json:"files"`
	}{Files: files}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal compile input: %w", err)
	}

	cmd := exec.Command("node", scriptPath)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(string(inputJSON))

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()

	select {
	case err := <-done:
		if err != nil {
			errMsg := stderr.String()
			if errMsg == "" {
				errMsg = err.Error()
			}
			return nil, fmt.Errorf("ts compile failed: %s", errMsg)
		}
	case <-time.After(10 * time.Second):
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("ts compile timed out after 10s")
	}

	var result CompileResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return nil, fmt.Errorf("failed to parse ts compile output: %w", err)
	}
	return &result, nil
}

// ExecuteResult holds the output of a TypeScript execution (compile + run).
type ExecuteResult struct {
	Data        json.RawMessage `json:"data"`
	Diagnostics []Diagnostic    `json:"diagnostics"`
	Error       string          `json:"error,omitempty"`
	JS          string          `json:"js,omitempty"`
	FetchLog    []FetchLogEntry `json:"fetch_log,omitempty"`
}

// FetchLogEntry is bounded request metadata captured for privileged previews.
type FetchLogEntry struct {
	URL        string `json:"url"`
	Method     string `json:"method"`
	Status     int    `json:"status,omitempty"`
	StatusText string `json:"statusText,omitempty"`
	Duration   int64  `json:"duration,omitempty"`
	Error      string `json:"error,omitempty"`
}

// ExecuteTypeScript compiles TypeScript source files and executes the result
// server-side in a sandboxed VM context with provided environment variables.
func ExecuteTypeScript(files map[string]string, env map[string]string, includePreviewDetails bool) (*ExecuteResult, error) {
	dir := tsRunnerDir()
	scriptPath := filepath.Join(dir, "execute.js")

	input := struct {
		Files                 map[string]string `json:"files"`
		Env                   map[string]string `json:"env"`
		IncludePreviewDetails bool              `json:"includePreviewDetails"`
	}{
		Files:                 files,
		Env:                   env,
		IncludePreviewDetails: includePreviewDetails,
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal execute input: %w", err)
	}

	args, err := sandboxedNodeArgs(dir, scriptPath)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command("node", args...)
	cmd.Dir = dir
	// Datasource env belongs only inside the VM. Never inherit backend process
	// credentials or Node option injection into the runner subprocess.
	cmd.Env = []string{"NODE_NO_WARNINGS=1"}
	cmd.Stdin = strings.NewReader(string(inputJSON))

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()

	select {
	case err := <-done:
		if err != nil {
			errMsg := stderr.String()
			if errMsg == "" {
				errMsg = err.Error()
			}
			return nil, fmt.Errorf("ts execute failed: %s", errMsg)
		}
	case <-time.After(15 * time.Second):
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("ts execute timed out after 15s")
	}

	var result ExecuteResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return nil, fmt.Errorf("failed to parse ts execute output: %w", err)
	}
	return &result, nil
}

func sandboxedNodeArgs(dir, scriptPath string) ([]string, error) {
	nodeVersionOnce.Do(func() {
		output, err := exec.Command("node", "--version").Output()
		if err != nil {
			nodeVersionErr = fmt.Errorf("failed to inspect Node.js runtime: %w", err)
			return
		}
		version := strings.TrimSpace(strings.TrimPrefix(string(output), "v"))
		parts := strings.Split(version, ".")
		if len(parts) < 2 {
			nodeVersionErr = fmt.Errorf("unsupported Node.js version %q", version)
			return
		}
		major, majorErr := strconv.Atoi(parts[0])
		minor, minorErr := strconv.Atoi(parts[1])
		if majorErr != nil || minorErr != nil || major < 20 {
			nodeVersionErr = fmt.Errorf("Node.js 20 or newer is required for datasource isolation")
			return
		}
		nodeMajor = major
		nodeMinor = minor
	})
	if nodeVersionErr != nil {
		return nil, nodeVersionErr
	}

	permissionFlag := "--permission"
	if nodeMajor == 20 || nodeMajor == 21 || (nodeMajor == 22 && nodeMinor < 13) {
		permissionFlag = "--experimental-permission"
	}
	args := []string{permissionFlag, "--allow-fs-read=" + dir}
	if nodeMajor >= 25 {
		args = append(args, "--allow-net")
	}
	return append(args, scriptPath), nil
}
