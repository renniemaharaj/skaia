package datasource

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Diagnostic is a single TypeScript compiler diagnostic.
type Diagnostic struct {
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

// CompileTypeScript compiles TypeScript source code to JavaScript by invoking
// the tsrunner Node.js script. Returns the compiled JS and any diagnostics.
func CompileTypeScript(source string) (*CompileResult, error) {
	dir := tsRunnerDir()
	scriptPath := filepath.Join(dir, "compile.js")

	cmd := exec.Command("node", scriptPath)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(source)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Set a reasonable timeout via context — but exec.Command doesn't take
	// context directly, so we use a timer and kill if needed.
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
