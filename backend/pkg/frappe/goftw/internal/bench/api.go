package bench

import (
	"encoding/json"
	"fmt"
	"strings"

	// "goftw/internal/deploy"
	"goftw/internal/environ"
	"net/http"

	"github.com/go-chi/chi/v5"
)

var (
	siteExtension = ".localhost"
)

// Response helpers
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ListSitesHandler lists all sites
func (b *Bench) ListSitesHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("[API] ListSitesHandler called")
	benchDir := environ.GetBenchPath()
	fmt.Printf("[API] Bench directory: %s\n", benchDir)

	sites, err := b.ListSites()
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to list sites: %v", err))
		return
	}

	fmt.Printf("[API] Found sites: %v\n", sites)
	writeJSON(w, 200, sites)
}

// ListAppsHandler lists all apps in the bench
func (b *Bench) ListAppsHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("[API] ListAppsHandler called")
	benchDir := environ.GetBenchPath()
	fmt.Printf("[API] Bench directory: %s\n", benchDir)

	apps, err := b.ListApps()
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to list apps: %v", err))
		return
	}

	fmt.Printf("[API] Found apps: %v\n", apps)
	writeJSON(w, 200, apps)
}

// GetSitesHandler returns a single site and its apps
func (b *Bench) GetSitesHandler(w http.ResponseWriter, r *http.Request) {
	siteName := chi.URLParam(r, "name")
	fmt.Printf("[API] GetSitesHandler called for site: %s\n", siteName)

	// Verify site exists
	fmt.Println("[API] Verifying site existence...")
	sites, _ := b.ListSites()
	found := false
	for _, s := range sites {
		if s == siteName {
			found = true
			break
		}
	}
	if !found {
		writeError(w, 404, "site not found")
		return
	}
	fmt.Printf("[API] Site %s exists\n", siteName)

	// Get installed apps for this site
	fmt.Printf("[API] Retrieving apps for site %s...\n", siteName)
	apps, err := b.ListAppsOnSite(siteName)
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to get site apps: %v", err))
		return
	}
	fmt.Printf("[API] Apps for site %s: %v\n", siteName, apps)

	resp := map[string]interface{}{
		"site": siteName,
		"apps": apps,
		"url":  fmt.Sprintf("http://%s", siteName),
	}
	writeJSON(w, 200, resp)
}

func normalizeSiteName(siteName string) string {
	if i := strings.LastIndex(siteName, "."); i != -1 {
		siteName = siteName[:i]
	}
	return siteName + siteExtension
}

// PutSitesHandler creates a new site and installs apps
func (b *Bench) PutSitesHandler(w http.ResponseWriter, r *http.Request) {
	siteName := chi.URLParam(r, "name")
	fmt.Printf("[API] PutSitesHandler called for site: %s\n", siteName)
	if siteName == "" {
		writeError(w, 400, "no site name")
		return
	}
	siteName = normalizeSiteName(siteName)

	// Parse body for apps list
	var body struct {
		Apps []string `json:"apps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid JSON body")
		return
	}
	fmt.Printf("[API] Requested apps to install: %v\n", body.Apps)

	// Create site
	fmt.Printf("[API] Creating site %s...\n", siteName)
	if err := b.NewSite(siteName, "root", "root"); err != nil {
		fmt.Printf("[ERROR] Could not create new site: %s %v", siteName, err)
		writeError(w, 500, fmt.Sprintf("failed to create site: %v", err))
		return
	}
	fmt.Printf("[API] Site %s created successfully\n", siteName)

	// Apply apps
	for _, app := range body.Apps {
		fmt.Printf("[API] Installing app %s on site %s...\n", app, siteName)
		if err := b.InstallApp(siteName, app); err != nil {
			fmt.Printf("[API] Fail to install app:%s on site: %s %v", app, siteName, err)
			writeError(w, 500, fmt.Sprintf("failed to install app %s: %v", app, err))
			b.DropSite(siteName, "root", "root")
			return
		}
		fmt.Printf("[API] App %s installed successfully\n", app)
	}

	// Restart deployment
	fmt.Println("[API] Restarting deployment services...")
	if err := b.RestartDeployment(); err != nil {
		fmt.Printf("[ERROR] Deployment restart failed: %v\n", err)
	}

	resp := map[string]interface{}{
		"site": siteName,
		"apps": body.Apps,
		"url":  fmt.Sprintf("http://%s", siteName),
	}
	writeJSON(w, 201, resp)
	fmt.Printf("[API] Site %s creation & apps applied successfully\n", siteName)
}
