package bench

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"goftw/internal/entity"
	"goftw/internal/fns"
	"goftw/internal/utils"
)

func appInCatalog(app string) bool {
	for _, catalogApp := range GetAppsForReact() {
		if catalogApp.Name == app {
			return true
		}
	}
	return false
}

func (b *Bench) appPath(app string) string {
	return filepath.Join(b.Path, "apps", app)
}

func (b *Bench) appSourceReady(app string) bool {
	if app == "frappe" {
		return true
	}

	appPath := b.appPath(app)
	if info, err := os.Stat(appPath); err != nil || !info.IsDir() {
		return false
	}

	modulePath := filepath.Join(appPath, app)
	if info, err := os.Stat(modulePath); err != nil || !info.IsDir() {
		return false
	}

	if _, err := os.Stat(filepath.Join(modulePath, "hooks.py")); err != nil {
		return false
	}

	return true
}

// GetApp fetches an app from branch, auto-healing if a previous fetch was incomplete
func (b *Bench) GetApp(app string) error {
	if !appInCatalog(app) {
		return fmt.Errorf("app %q is not in the available app catalog", app)
	}
	if b.appSourceReady(app) {
		return nil
	}

	// First attempt: try to get by name directly
	if err := b.ExecRunInBenchPrintIO("bench", "get-app", "--branch", b.Branch, app); err == nil {
		return nil
	}

	// If failed, clean up any existing incomplete app dir
	appPath := b.appPath(app)
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

// GetAppStream fetches an app and streams progress, auto-healing incomplete app dirs.
func (b *Bench) GetAppStream(w io.Writer, app string) error {
	if !appInCatalog(app) {
		return fmt.Errorf("app %q is not in the available app catalog", app)
	}
	if b.appSourceReady(app) {
		fmt.Fprintf(w, "[APPS] App source already available: %s\n", app)
		return nil
	}

	appPath := b.appPath(app)
	if _, statErr := os.Stat(appPath); statErr == nil {
		fmt.Fprintf(w, "[APPS] Removing incomplete app directory: %s\n", appPath)
		if rmErr := fns.RemoveDirectory(appPath); rmErr != nil {
			return fmt.Errorf("failed to remove incomplete app dir %s: %w", appPath, rmErr)
		}
	}

	fmt.Fprintf(w, "[APPS] Fetching app source: %s (branch: %s)\n", app, b.Branch)
	if err := b.ExecRunInBenchStream(w, "bench", "get-app", "--branch", b.Branch, app); err == nil {
		if b.appSourceReady(app) {
			return nil
		}
		return fmt.Errorf("bench get-app completed but app source for %s is still incomplete", app)
	}

	frappeAppURL := fmt.Sprintf("https://github.com/frappe/%s", app)
	fmt.Fprintf(w, "[APPS] Name lookup failed; retrying from %s\n", frappeAppURL)
	if err := b.ExecRunInBenchStream(w, "bench", "get-app", "--branch", b.Branch, frappeAppURL); err != nil {
		return fmt.Errorf("failed to get app %s from %s: %w", app, frappeAppURL, err)
	}
	if !b.appSourceReady(app) {
		return fmt.Errorf("fetched app %s but source is still incomplete", app)
	}
	return nil
}

// fetchMissingApps ensures that every app in instance.json exists in bench/apps
func (b *Bench) fetchMissingApps(site entity.Site) error {
	for _, app := range site.Apps {
		if app == "frappe" {
			continue
		}
		if !b.appSourceReady(app) {
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

	if err := b.GetApp(app); err != nil {
		return err
	}

	return b.ExecRunInBenchPrintIO("bench", "--site", site, "install-app", app)
}

// InstallAppStream installs an app on a site, streaming output to an io.Writer
func (b *Bench) InstallAppStream(w io.Writer, site, app string) error {
	fmt.Fprintf(w, "[APPS] Installing app: %s on site: %s\n", app, site)

	if err := b.GetAppStream(w, app); err != nil {
		return fmt.Errorf("failed to prepare app %s for install: %w", app, err)
	}

	if err := b.ExecRunInBenchStream(w, "bench", "--site", site, "install-app", app); err != nil {
		return fmt.Errorf("failed to install app %s on site %s: %w", app, site, err)
	}

	return nil
}
