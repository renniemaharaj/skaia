package bench

import (
	"encoding/json"
	"fmt"
	"strings"

	// "goftw/internal/deploy"
	"goftw/internal/environ"
	"goftw/internal/entity"
	"goftw/internal/db"
	"net/http"
	"os"

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

type flushWriter struct {
	w http.ResponseWriter
	f http.Flusher
}

func (fw *flushWriter) Write(p []byte) (n int, err error) {
	n, err = fw.w.Write(p)
	if fw.f != nil {
		fw.f.Flush()
	}
	return
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

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	fw := &flushWriter{w: w}
	if f, ok := w.(http.Flusher); ok {
		fw.f = f
	}

	// Create site
	fmt.Fprintf(fw, "[API] Creating site %s...\n", siteName)
	if err := b.NewSiteStream(fw, siteName, "root", "root"); err != nil {
		fmt.Fprintf(fw, "[ERROR] Could not create new site: %s %v\n", siteName, err)
		return
	}
	fmt.Fprintf(fw, "[API] Site %s created successfully\n", siteName)

	// Apply apps
	for _, app := range body.Apps {
		fmt.Fprintf(fw, "[API] Installing app %s on site %s...\n", app, siteName)
		if err := b.InstallAppStream(fw, siteName, app); err != nil {
			fmt.Fprintf(fw, "[API] Fail to install app:%s on site: %s %v\n", app, siteName, err)
			b.DropSite(siteName, "root", "root")
			return
		}
		fmt.Fprintf(fw, "[API] App %s installed successfully\n", app)
	}

	// Restart deployment
	fmt.Fprintf(fw, "[API] Restarting deployment services...\n")
	if err := b.RestartDeployment(); err != nil {
		fmt.Fprintf(fw, "[ERROR] Deployment restart failed: %v\n", err)
	}

	fmt.Fprintf(fw, "[API] Site %s creation & apps applied successfully\n", siteName)
}

// RunSupervisorNginx starts the bench in production mode with Supervisor and Nginx
func (b *Bench) RerunSupervisorNginx(w http.ResponseWriter, r *http.Request) {
	err := b.RestartDeployment()
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to restart deployment: %v", err))
		return
	}

	writeJSON(w, 200, map[string]string{"status": "deployment restarted"})
}

// ReloadNginxHandler generates nginx config and reloads nginx
func (b *Bench) ReloadNginxHandler(w http.ResponseWriter, r *http.Request) {
	err := b.ReloadNginx()
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to reload nginx: %v", err))
		return
	}
	writeJSON(w, 200, map[string]string{"status": "nginx reloaded"})
}

// UpdateHandler runs bench update
func (b *Bench) UpdateHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("[API] UpdateHandler called")
	if err := b.ExecRunInBenchPrintIO("bench", "update"); err != nil {
		writeError(w, 500, fmt.Sprintf("update failed: %v", err))
		return
	}
	writeJSON(w, 200, map[string]string{"status": "updated"})
}

// MigrateHandler runs bench migrate
func (b *Bench) MigrateHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("[API] MigrateHandler called")
	if err := b.ExecRunInBenchPrintIO("bench", "migrate"); err != nil {
		writeError(w, 500, fmt.Sprintf("migrate failed: %v", err))
		return
	}
	writeJSON(w, 200, map[string]string{"status": "migrated"})
}

// BackupHandler runs bench backup
func (b *Bench) BackupHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("[API] BackupHandler called")
	if err := b.ExecRunInBenchPrintIO("bench", "backup"); err != nil {
		writeError(w, 500, fmt.Sprintf("backup failed: %v", err))
		return
	}
	writeJSON(w, 200, map[string]string{"status": "backed up"})
}

// InitBenchHandler initializes the bench and streams output
func (b *Bench) InitBenchHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	fw := &flushWriter{w: w}
	if f, ok := w.(http.Flusher); ok {
		fw.f = f
	}

	// Parse branch from payload or use default
	var body struct {
		Branch string `json:"branch"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	branch := body.Branch
	if branch == "" {
		branch = b.Branch
	}

	fmt.Fprintf(fw, "[API] Initializing bench with branch: %s\n", branch)
	if _, err := os.Stat(b.Path); err == nil {
		fmt.Fprintf(fw, "[API] Bench directory %s already exists, skipping init\n", b.Path)
		return
	}
	if err := b.Initialize(branch); err != nil {
		fmt.Fprintf(fw, "[ERROR] Bench init failed: %v\n", err)
		return
	}
	fmt.Fprintf(fw, "[API] Bench initialized successfully\n")
}

// CheckoutSitesHandler runs sites synchronization
func (b *Bench) CheckoutSitesHandler(w http.ResponseWriter, r *http.Request, instanceCfx *entity.Instance, dbCfg db.Config) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	fw := &flushWriter{w: w}
	if f, ok := w.(http.Flusher); ok {
		fw.f = f
	}

	if err := b.CheckoutSites(instanceCfx, dbCfg.User, dbCfg.Password); err != nil {
		fmt.Fprintf(fw, "[ERROR] sites sync failed: %v\n", err)
		return
	}
	fmt.Fprintf(fw, "[API] CheckoutSites completed successfully\n")
}

// StartDeploymentHandler starts the deployment process based on deployment mode
func (b *Bench) StartDeploymentHandler(w http.ResponseWriter, r *http.Request, defaultDeployment string) {
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	fw := &flushWriter{w: w}
	if f, ok := w.(http.Flusher); ok {
		fw.f = f
	}

	// Parse deployment override from payload or use default
	var body struct {
		Deployment string `json:"deployment"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	deployment := body.Deployment
	if deployment == "" {
		deployment = defaultDeployment
	}

	fmt.Fprintf(fw, "[API] Starting deployment mode: %s\n", deployment)
	switch deployment {
	case "production":
		if err := b.RunSupervisorNginx(); err != nil {
			fmt.Fprintf(fw, "[ERROR] Production mode failed: %v\n", err)
			return
		}
	default:
		if err := b.StartBench(); err != nil {
			fmt.Fprintf(fw, "[ERROR] Development mode failed: %v\n", err)
			return
		}
	}
	fmt.Fprintf(fw, "[API] Deployment started successfully\n")
}
