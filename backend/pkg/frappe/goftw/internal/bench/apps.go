package bench

import (
	"fmt"
	"goftw/internal/entity"
	"goftw/internal/fns"
	"goftw/internal/utils"
	"os"
	"path/filepath"
)

// GetApp fetches an app from branch, auto-healing if a previous fetch was incomplete
func (b *Bench) GetApp(app string) error {
	// First attempt: try to get by name directly
	if err := b.ExecRunInBenchPrintIO("bench", "get-app", "--branch", b.Branch, app); err == nil {
		return nil
	}

	// If failed, clean up any existing incomplete app dir
	appPath := filepath.Join(b.Path, "apps", app)
	if _, statErr := os.Stat(appPath); statErr == nil {
		fmt.Printf("[APPS] Removing existing incomplete app directory: %s\n", appPath)
		if rmErr := fns.RemoveDirectory(appPath); rmErr != nil {
			return fmt.Errorf("failed to remove incomplete app dir %s: %w", appPath, rmErr)
		}
	}

	// Retry by fetching from GitHub directly
	fmt.Printf("[APPS] App get failed, attempting to fetch app from GitHub...\n")
	frappeAppUrl := fmt.Sprintf("https://github.com/frappe/%s", app)

	if err := b.ExecRunInBenchPrintIO("bench", "get-app", "--branch", b.Branch, frappeAppUrl); err != nil {
		return fmt.Errorf("failed to get app %s from %s: %w", app, frappeAppUrl, err)
	}

	return nil
}

// fetchMissingApps ensures that every app in instance.json exists in bench/apps
func (b *Bench) fetchMissingApps(site entity.Site) error {
	for _, app := range site.Apps {
		if app == "frappe" {
			continue
		}
		appPath := filepath.Join(b.Path, "apps", app)
		if _, err := os.Stat(appPath); os.IsNotExist(err) {
			fmt.Printf("[APP] Fetching missing app: %s\n", app)
			if err := b.GetApp(app); err != nil {
				fmt.Printf("[ERROR] Failed to fetch app %s: %v\n", app, err)
				return err
			}
		}
	}
	return nil
}

// installMissingApps installs apps that are expected but not currently present
func (b *Bench) installMissingApps(siteName string, expected, current []string) error {
	for _, app := range utils.Difference(expected, current) {
		if app != "frappe" {
			fmt.Printf("[APPS] Installing missing app: %s\n", app)
			if err := b.InstallApp(siteName, app); err != nil {
				fmt.Printf("[ERROR] Failed to install app %s on site %s: %v\n", app, siteName, err)
				return err
			}
		}
	}
	return nil
}

// uninstallExtraApps uninstalls apps that are present but not expected
func (b *Bench) uninstallExtraApps(siteName string, current, expected []string) error {
	for _, app := range utils.Difference(current, expected) {
		if app != "frappe" {
			fmt.Printf("[APPS] Uninstalling extra app: %s\n", app)
			if err := b.UninstallApp(siteName, app); err != nil {
				return err
			}
		}
	}
	return nil
}

// UninstallApp removes an app from a site
func (b *Bench) UninstallApp(site, app string) error {
	fmt.Printf("[APPS] Uninstalling app: %s from site: %s\n", app, site)
	return b.ExecRunInBenchPrintIO("bench", "--site", site, "uninstall-app", app, "--yes")
}

// InstallApp installs an app on a site
func (b *Bench) InstallApp(site, app string) error {
	fmt.Printf("[APPS] Installing app: %s on site: %s\n", app, site)

	// First attempt: direct install
	if err := b.ExecRunInBenchPrintIO("bench", "--site", site, "install-app", app); err == nil {
		return nil
	}

	// Try fetching app
	if err := b.GetApp(app); err != nil {
		return fmt.Errorf("failed to install app %s after fetching: %w", app, err)
	}

	// Retry install after fetching
	if err := b.ExecRunInBenchPrintIO("bench", "--site", site, "install-app", app); err != nil {
		return fmt.Errorf("failed to install app %s after fetching: %w", app, err)
	}

	return nil
}
