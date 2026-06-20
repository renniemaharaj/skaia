package whoiam

import (
	"os"
	"os/exec"
)

// ExecRunSwallowIO runs a command with sudo privileges, returning the output
func ExecRunSwallowIO(args ...string) ([]byte, error) {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Env = os.Environ()
	out, err := cmd.CombinedOutput()
	return out, err
}

// ExecRunPrintIO runs a command with sudo privileges and prints its output and error.
func ExecRunPrintIO(args ...string) error {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// ExecStartPrintIO creates, starts and returns a command without blocking
func ExecStartPrintIO(args ...string) (*exec.Cmd, error) {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd, cmd.Start()
}
