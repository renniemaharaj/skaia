package bench

import (
	"fmt"
	"os"

	"goftw/internal/environ"
	"goftw/internal/whoiam"
)

var (
	unmannedDeployment bool
)

// DeployThroughShell runs the /scripts/service.sh directly.
// This is "unmanned" mode where Go should not attempt to control WSGI state.
func (b *Bench) DeployThroughShell(deployMode string) {
	unmannedDeployment = true
	os.Setenv("BENCH_DIR", environ.GetBenchPath())
	os.Setenv("DEPLOYMENT", deployMode)
	os.Setenv("MERGED_SUPERVISOR_CONF", "/supervisor-merged.conf")
	os.Setenv("HEAD_PATCH_CONF", "/patches/head.patch.conf")

	whoiam.ExecRunPrintIO("bash", "/scripts/service.sh")
}

// RestartDeployment restarts either production or development WSGI depending on state.
func (b *Bench) RestartDeployment() error {
	if unmannedDeployment {
		return fmt.Errorf("cannot restart WSGI: unmanaged shell deployment active")
	}

	if productionCMD != nil {
		// Hard restart supervisor + nginx
		if err := b.TerminateSupervisorNginx(); err != nil {
			fmt.Printf("[ERROR] Could not stop production: %v", err)
		}
		if err := b.RunSupervisorNginx(); err != nil {
			return fmt.Errorf("failed to start production WSGI: %v", err)
		}
		fmt.Println("[WSGI] Production WSGI restarted (hard)")
		return nil
	}

	if developmentCMD != nil {
		// Hard restart bench start
		if err := b.StopBench(); err != nil {
			return fmt.Errorf("failed to stop development WSGI: %v", err)
		}
		if err := b.StartBench(); err != nil {
			return fmt.Errorf("failed to start development WSGI: %v", err)
		}
		fmt.Println("[WSGI] Development WSGI restarted (hard)")
		return nil
	}

	return fmt.Errorf("unknown WSGI state: neither production nor development running")
}
