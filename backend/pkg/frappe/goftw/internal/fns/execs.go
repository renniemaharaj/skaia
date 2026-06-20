package fns

import (
	"os"
	"os/exec"
)

// ExecRunPrintIO runs a command with sudo privileges and prints its output and error.
func ExecRunPrintIO(args ...string) error {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func ExecStartPrintIO(args ...string) (*exec.Cmd, error) {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd, cmd.Start()
}
