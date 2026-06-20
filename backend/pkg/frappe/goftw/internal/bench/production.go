package bench

import (
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"syscall"

	internalExec "goftw/internal/fns"
)

var (
	productionCMD *exec.Cmd
	blockRegex    = regexp.MustCompile(`server_name\s+([\s\S]*?);`)
)

// RunSupervisorNginx sets up supervisor for the bench, merges configs, and starts supervisord.
func (b *Bench) RunSupervisorNginx() error {
	if unmannedDeployment {
		return fmt.Errorf("cannot run production WSGI: unmanaged shell deployment active")
	}
	// Configure nginx
	if err := b.configurePatchNginx(b, b.ServerName); err != nil {
		fmt.Printf("[ERROR] Failed to setup nginx: %v\n", err)
		return err
	}

	// Configure supervisor
	tmpFile, err := b.configurePatchSupervisor(b)
	if err != nil {
		fmt.Printf("[ERROR] Failed configure and patch supervisor: %v\n", err)
		return err
	}

	productionCMD, err = internalExec.ExecStartPrintIO("sudo", "supervisord", "-c", tmpFile)
	// Start without waiting
	if err != nil {
		fmt.Printf("[ERROR] Failed to start supervisord: %v\n", err)
		return err
	}

	// Supervisord is running in the background now
	fmt.Printf("[WSGI] Production WSGI started (PID: %d).\n", productionCMD.Process.Pid)
	return nil
}

// TerminateSupervisorNginx stops production services (supervisord + nginx).
func (b *Bench) TerminateSupervisorNginx() error {
	if productionCMD == nil || productionCMD.Process == nil {
		return fmt.Errorf("production WSGI not running")
	}
	if unmannedDeployment {
		return fmt.Errorf("cannot stop production WSGI: unmanaged shell deployment active")
	}

	// Send SIGTERM to gracefully stop supervisord
	if err := productionCMD.Process.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("failed to stop production WSGI: %v", err)
	}

	fmt.Println("[WSGI] Production WSGI stopped")
	productionCMD = nil
	return nil
}

// configurePatchSupervisor runs supervisor setup, patches it and returns conf or error
func (b *Bench) configurePatchSupervisor(bench *Bench) (string, error) {
	supervisorConf := bench.Path + "/config/supervisor.conf"
	wrapperConf := "/patches/head.patch.conf"

	// Ensure log dir
	if err := os.MkdirAll("/var/log", 0755); err != nil {
		fmt.Printf("[ERROR] Failed to create /var/log: %v\n", err)
		return "", fmt.Errorf("failed to create /var/log: %v", err)
	}

	// Remove old config to force regeneration
	_ = internalExec.RemoveFile(supervisorConf)

	if err := bench.ExecRunInBenchPrintIO("bench", "setup", "supervisor", "--skip-redis"); err != nil {
		fmt.Printf("[ERROR] Failed to setup supervisor: %v\n", err)
		return "", fmt.Errorf("failed to setup supervisor: %v", err)
	}

	// Merge configs
	wrapper, err := internalExec.ReadFile(wrapperConf)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read supervisor wrapper config: %v\n", err)
		return "", err
	}
	benchConf, err := internalExec.ReadFile(supervisorConf)
	if err != nil {
		fmt.Printf("[ERROR] Failed to read supervisor config: %v\n", err)
		return "", err
	}

	tmpFile := "/tmp/supervisor-merged.tmp"
	if err := os.WriteFile(tmpFile, append(wrapper, append([]byte("\n"), benchConf...)...), 0644); err != nil {
		fmt.Printf("[ERROR] Failed to write temporary merged config: %v\n", err)
		return "", fmt.Errorf("failed to write temporary merged config: %v", err)
	}
	return tmpFile, nil
}

// configurePatchNginx sets up nginx using bench and symlinks the config.
func (b *Bench) configurePatchNginx(bench *Bench, serverName string) error {
	nginxConf := bench.Path + "/config/nginx.conf"
	nginxConfDest := "/etc/nginx/conf.d/frappe-bench.conf"
	logPatch := "/patches/log.patch.conf"
	globalConf := "/etc/nginx/nginx.conf"

	// Remove old configs/links to force regeneration
	_ = internalExec.RemoveFile(nginxConf)
	_ = internalExec.RemoveFile(nginxConfDest)

	// Generate nginx config
	if err := bench.ExecRunInBenchPrintIO("bench", "setup", "nginx"); err != nil {
		fmt.Printf("[ERROR] Failed to setup nginx: %v\n", err)
		return fmt.Errorf("failed to setup nginx: %v", err)
	}

	// Inject patch into global nginx.conf if not already present
	checkCmd := []string{"grep", "-q", "log_format main", globalConf}
	if err := internalExec.ExecRunPrintIO(checkCmd...); err != nil {
		fmt.Printf("[PATCH] Injecting main log_format into %s\n", globalConf)
		if err := internalExec.ExecRunPrintIO("sudo", "sed", "-i", "/http {/r "+logPatch, globalConf); err != nil {
			fmt.Printf("[ERROR] Failed to inject main.patch.conf: %v\n", err)
			// not fatal — continue
		}
	}

	// Note: Dynamic proxy (port 2020) is handled by a separate nginx service in docker-compose
	// No need to patch server_name here for dynamic routing

	// Symlink bench-generated config
	err := internalExec.ExecRunPrintIO("sudo", "ln", "-sf", nginxConf, nginxConfDest)
	if err != nil {
		fmt.Printf("[ERROR] Failed to symlink nginx config: %v\n", err)
		return err
	}

	fmt.Printf("[NGINX] Nginx configured and symlinked\n")
	// if str, err := internalExec.ReadFile(nginxConf); err == nil {
	// 	fmt.Println(string(str))
	// }
	return nil
}

// contains is a helper function to check if a string contains a substring
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
