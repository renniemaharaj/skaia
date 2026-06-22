package provisioning

import (
	"bufio"
	"os/exec"

	"github.com/renniemaharaj/grouplogs/pkg/logger"
)

func streamCommand(cmd *exec.Cmd, l *logger.Logger) error {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	// Stream stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		if err := scanner.Err(); err != nil {
			l.ErrorF("Error reading stdout: %v", err)
			return
		}
		for scanner.Scan() {
			l.Info(scanner.Text())
		}
	}()

	// Stream stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		if err := scanner.Err(); err != nil {
			l.ErrorF("Error reading stderr: %v", err)
			return
		}
		for scanner.Scan() {
			l.Info(scanner.Text()) // log stderr as info for simplicity, or Error
		}
	}()

	return cmd.Wait()
}
