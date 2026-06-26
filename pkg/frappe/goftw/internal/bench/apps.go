package bench

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"

	"goftw/internal/entity"
	"goftw/internal/fns"
	internalExec "goftw/internal/fns"
	"goftw/internal/utils"
)

var (
	requiredAppsRx = regexp.MustCompile(`(?s)required_apps\s*=\s*\[([^\]]*)\]`)
	quotedStringRx = regexp.MustCompile(`['"]([^'"]+)['"]`)
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

func (b *Bench) appHooksPath(app string) string {
	return filepath.Join(b.appPath(app), app, "hooks.py")
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

	if _, err := os.Stat(b.appHooksPath(app)); err != nil {
		return false
	}

	return true
}

func (b *Bench) requiredApps(app string) ([]string, error) {
	if app == "frappe" || !b.appSourceReady(app) {
		return nil, nil
	}

	data, err := os.ReadFile(b.appHooksPath(app))
	if err != nil {
		return nil, err
	}

	match := requiredAppsRx.FindSubmatch(data)
	if match == nil {
		return nil, nil
	}

	seen := map[string]bool{}
	var apps []string
	for _, quoted := range quotedStringRx.FindAllSubmatch(match[1], -1) {
		appName := string(quoted[1])
		if appName == "" || appName == "frappe" || seen[appName] {
			continue
		}
		seen[appName] = true
		apps = append(apps, appName)
	}
	return apps, nil
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
	return b.getAppStream(w, app)
}

func (b *Bench) getAppStream(w io.Writer, app string) error {
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

func (b *Bench) siteHasApp(site, app string) bool {
	current, err := b.ListAppsOnSite(site)
	if err != nil {
		return false
	}
	for _, currentApp := range current {
		if currentApp.Name == app {
			return true
		}
	}
	return false
}

func (b *Bench) prepareRequiredAppsStream(w io.Writer, site, app string, visiting map[string]bool) error {
	if visiting[app] {
		return fmt.Errorf("cycle detected while resolving required apps for %s", app)
	}
	visiting[app] = true
	defer delete(visiting, app)

	required, err := b.requiredApps(app)
	if err != nil {
		return fmt.Errorf("failed to inspect required apps for %s: %w", app, err)
	}

	for _, requiredApp := range required {
		fmt.Fprintf(w, "[APPS] Required app for %s: %s\n", app, requiredApp)
		if err := b.getAppStream(w, requiredApp); err != nil {
			return fmt.Errorf("failed to prepare required app %s for %s: %w", requiredApp, app, err)
		}
		if err := b.prepareRequiredAppsStream(w, site, requiredApp, visiting); err != nil {
			return err
		}
		if b.siteHasApp(site, requiredApp) {
			fmt.Fprintf(w, "[APPS] Required app already installed on %s: %s\n", site, requiredApp)
			continue
		}
		fmt.Fprintf(w, "[APPS] Installing required app %s on site: %s\n", requiredApp, site)
		if err := b.ExecRunInBenchStream(w, "bench", "--site", site, "install-app", requiredApp); err != nil {
			return fmt.Errorf("failed to install required app %s on site %s: %w", requiredApp, site, err)
		}
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
	err := b.ExecRunInBenchPrintIO("bench", "--site", site, "uninstall-app", app, "--yes")
	if err == nil {
		b.RestartFrappeServices()
	}
	return err
}

// InstallApp installs an app on a site
func (b *Bench) InstallApp(site, app string) error {
	fmt.Printf("[APPS] Installing app: %s on site: %s\n", app, site)

	if err := b.GetApp(app); err != nil {
		return err
	}

	err := b.ExecRunInBenchPrintIO("bench", "--site", site, "install-app", app)
	if err == nil {
		b.RestartFrappeServices()
	}
	return err
}

// InstallAppStream installs an app on a site, streaming output to an io.Writer
func (b *Bench) InstallAppStream(w io.Writer, site, app string) error {
	fmt.Fprintf(w, "[APPS] Installing app: %s on site: %s\n", app, site)

	if err := b.GetAppStream(w, app); err != nil {
		return fmt.Errorf("failed to prepare app %s for install: %w", app, err)
	}
	if err := b.prepareRequiredAppsStream(w, site, app, map[string]bool{}); err != nil {
		return err
	}

	if err := b.ExecRunInBenchStream(w, "bench", "--site", site, "install-app", app); err != nil {
		return fmt.Errorf("failed to install app %s on site %s: %w", app, site, err)
	}

	b.RestartFrappeServicesStream(w)

	return nil
}

// RestartFrappeServices kills gunicorn and frappe workers, relying on supervisor or honcho to autorestart them
func (b *Bench) RestartFrappeServices() error {
	fmt.Println("[BENCH] Restarting Frappe services (killing workers for autorestart)...")
	internalExec.ExecRunPrintIO("sudo", "pkill", "-TERM", "gunicorn")
	internalExec.ExecRunPrintIO("pkill", "-TERM", "gunicorn")
	internalExec.ExecRunPrintIO("sudo", "pkill", "-TERM", "-f", "frappe worker")
	internalExec.ExecRunPrintIO("pkill", "-TERM", "-f", "frappe worker")
	return nil
}

func (b *Bench) RestartFrappeServicesStream(w io.Writer) error {
	fmt.Fprintf(w, "[BENCH] Restarting Frappe services (killing workers for autorestart)...\n")
	b.RestartFrappeServices()
	return nil
}
