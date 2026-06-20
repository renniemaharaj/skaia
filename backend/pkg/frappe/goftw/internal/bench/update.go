package bench

import (
	"fmt"
	"os"
)

// ManualUpdate runs all safe update steps in sequence.
func (b *Bench) ManualUpdate() error {
	// STEP 1: Update Apps
	fmt.Println("[APPS] Upgrading installed apps")
	if err := b.GitPullOnApps(); err != nil {
		fmt.Printf("[ERROR] Failed to list apps for update: %v\n", err)
		return err
	}
	// STEP 2: Python deps
	fmt.Println("[PYTHON] Upgrading pip and Python packages inside bench env...")
	if err := b.UpdatePython(); err != nil {
		fmt.Printf("[ERROR] Failed to update python: %v\n", err)
		return err
	}
	// STEP 3: Node/Yarn deps
	fmt.Println("[NODE] Installing/building frontend dependencies...")
	if err := b.RunYarnInstallBuild(); err != nil {
		fmt.Printf("[ERROR] Failed to update node: %v\n", err)
		return err
	}
	// STEP 4: Migrate/patches
	fmt.Println("[MIGRATE] Running database migrations & patches...")
	if err := b.MigrateSites(); err != nil {
		fmt.Printf("[ERROR] Failed to migrate sites: %v\n", err)
		return err
	}
	// STEP 5: Build assets
	fmt.Println("[BUILD] Rebuilding static assets...")
	if err := b.BuildAssets(); err != nil {
		fmt.Printf("[ERROR] Failed to build assets: %v\n", err)
		return err
	}
	fmt.Println("[UPDATE] Update completed successfully")
	// fmt.Println("[SERVICES] Reloading supervisor and nginx...")
	return nil
}

// Updates every installed apps by pulling new commits
func (b *Bench) GitPullOnApps() error {
	appNames, err := b.ListApps()
	if err != nil {
		return err
	}
	for _, app := range appNames {
		appPath := b.Path + "/apps/" + app
		if _, err := os.Stat(appPath); os.IsNotExist(err) {
			fmt.Printf("[APPS] Missing app: %s\n", app)
			continue
		}
		fmt.Printf("[APPS] Pulling latest for: %s\n", app)
		if err := b.ExecRunInBenchPrintIO("git", "-C", appPath, "pull"); err != nil {
			fmt.Printf("[ERROR] Failed to update app %s: %v\n", app, err)
			return err
		}
	}
	return nil
}

// Upgrades python virtual environment requirements
func (b *Bench) UpdatePython() error {
	venvPip := fmt.Sprintf("%s/env/bin/pip", b.Path)
	if err := b.ExecRunInBenchPrintIO("sudo", venvPip, "install", "--upgrade", "pip", "setuptools", "wheel"); err != nil {
		return fmt.Errorf("[PYTHON] Failed to upgrade pip/setuptools/wheel: %v", err)
	}
	// And, install/upgrade frappe-bench or other global bench packages inside env
	if err := b.ExecRunInBenchPrintIO("sudo", venvPip, "install", "--upgrade", "frappe-bench", "gunicorn"); err != nil {
		return fmt.Errorf("[PYTHON] Failed to upgrade frappe-bench/gunicorn: %v", err)
	}
	return nil
}

// Update yarn dependencies and builds
func (b *Bench) RunYarnInstallBuild() error {
	frappePath := b.Path + "/apps/frappe"
	if err := b.ExecRunInBenchPrintIO("sudo", "yarn", "--cwd", frappePath, "install"); err != nil {
		return err
	}
	return b.ExecRunInBenchPrintIO("sudo", "yarn", "--cwd", frappePath, "build")
}

// Run bench build
func (b *Bench) BuildAssets() error {
	return b.ExecRunInBenchPrintIO("bench", "build")
}
