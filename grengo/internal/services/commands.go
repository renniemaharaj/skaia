package services

import (
	"io"
	"os"
	"os/exec"
)

type CommandResult struct {
	Output   string
	ExitCode int
}

type CommandRunner struct {
	root string
}

func NewCommandRunner(root string) CommandRunner {
	return CommandRunner{root: root}
}

func (r CommandRunner) RunSelf(args ...string) (CommandResult, error) {
	self, err := os.Executable()
	if err != nil {
		return CommandResult{}, err
	}

	cmd := exec.Command(self, args...)
	cmd.Dir = r.root
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	output, err := cmd.CombinedOutput()
	result := CommandResult{Output: string(output)}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}
		return result, err
	}

	return result, nil
}

func (r CommandRunner) RunSelfStream(w io.Writer, args ...string) (CommandResult, error) {
	self, err := os.Executable()
	if err != nil {
		return CommandResult{}, err
	}

	cmd := exec.Command(self, args...)
	cmd.Dir = r.root
	cmd.Env = append(os.Environ(), "GRENGO_NONINTERACTIVE=1")

	cmd.Stdout = w
	cmd.Stderr = w

	err = cmd.Run()
	result := CommandResult{}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}
		return result, err
	}

	return result, nil
}
