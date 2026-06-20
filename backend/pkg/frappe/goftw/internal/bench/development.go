package bench

import (
	"fmt"
	"os/exec"
	"syscall"
)

var (
	developmentCMD *exec.Cmd
)

// StartBench starts the bench in development mode (`bench start`) without blocking.
func (b *Bench) StartBench() error {
	if unmannedDeployment {
		return fmt.Errorf("cannot start development WSGI: unmanaged shell deployment active")
	}
	if developmentCMD != nil {
		fmt.Printf("[ERROR] Development process already running")
	}
	fmt.Printf("[MODE] DEVELOPMENT\n")
	// benchDir := environ.GetBenchPath()

	developmentCMD, err := b.ExecStartInBenchPrintIO("bench", "start")
	// Start without waiting (non-blocking)
	if err != nil {
		return fmt.Errorf("failed to start bench: %v", err)
	}

	fmt.Printf("[DEV] Bench started (PID: %d)\n", developmentCMD.Process.Pid)

	return nil
}

// StopBench stops the bench process if running.
func (b *Bench) StopBench() error {
	if developmentCMD == nil {
		return fmt.Errorf("cannot stop development WSGI: unmanaged shell deployment active")
	}
	if developmentCMD != nil && developmentCMD.Process != nil {
		if err := productionCMD.Process.Signal(syscall.SIGTERM); err != nil {
			return fmt.Errorf("failed to stop develeopment WSGI: %v", err)
		}
		developmentCMD = nil
	}
	fmt.Println("[WSGI] Development WSGI stopped (bench terminated)")
	return nil
}
