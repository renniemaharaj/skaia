package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/skaia/grengo/internal/repo"
)

// Site listing, env, arm/disarm

// apiSiteInfo holds structured site data returned by the internal API.
type apiSiteInfo struct {
	Name     string   `json:"name"`
	Port     string   `json:"port"`
	Status   string   `json:"status"`
	Running  bool     `json:"running"`
	Armed    bool     `json:"armed"`
	Domains  []string `json:"domains"`
	DBName   string   `json:"db_name"`
	Features string   `json:"features"`
}

// apiListSites reads the backends/ directory and returns structured JSON.
func apiListSites(w http.ResponseWriter, r *http.Request) {
	store := repo.New(ProjectRoot())
	entries, err := store.BackendEntries()
	if err != nil {
		if os.IsNotExist(err) {
			apiJSON(w, http.StatusOK, []apiSiteInfo{})
			return
		}
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	sites := []apiSiteInfo{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		ef := store.SiteEnvFile(e.Name())
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}

		name := envVal(ef, "CLIENT_NAME")
		port := envVal(ef, "PORT")
		domainsStr := envVal(ef, "DOMAINS")
		dbName := envVal(ef, "POSTGRES_DB")
		features := envVal(ef, "FEATURES_ENABLED")

		status := "enabled"
		if store.IsSiteDisabled(e.Name()) {
			status = "disabled"
		}

		running := clientRunning(name)

		// Check armed status: look for any .armed file inside the client's armed/ dir.
		armed := store.IsSiteArmed(e.Name())

		domains := []string{}
		if domainsStr != "" {
			domains = strings.Fields(domainsStr)
		}

		sites = append(sites, apiSiteInfo{
			Name:     name,
			Port:     port,
			Status:   status,
			Running:  running,
			Armed:    armed,
			Domains:  domains,
			DBName:   dbName,
			Features: features,
		})
	}

	apiJSON(w, http.StatusOK, sites)
}

// Site .env read/write

func apiGetEnv(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}

	data, err := repo.New(ProjectRoot()).ReadSiteEnv(name)
	if err != nil {
		if os.IsNotExist(err) {
			apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
			return
		}
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"content": string(data)})
}

// apiPutEnv overwrites the .env file for a site.
func apiPutEnv(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}

	store := repo.New(ProjectRoot())
	if !store.SiteEnvExists(name) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB limit
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apiError(w, http.StatusBadRequest, "invalid json or body too large")
		return
	}

	if !strings.Contains(body.Content, "CLIENT_NAME=") || !strings.Contains(body.Content, "PORT=") {
		apiError(w, http.StatusBadRequest, "content missing required CLIENT_NAME= or PORT= declarations")
		return
	}

	if err := store.WriteSiteEnv(name, body.Content); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Arm / Disarm

// apiArmSite creates a .armed sentinel file in the site's armed/ directory.
func apiArmSite(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}
	store := repo.New(ProjectRoot())
	if !store.SiteExists(name) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	if err := store.ArmSite(name, time.Now()); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Also write into the running container's armed/ dir (mounted at /app/armed).
	// The site container reads from its own local armed/ directory.
	// Since we volume-mount ./armed:/app/armed we've already written the file above.

	apiJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": true})
}

// apiDisarmSite removes the .armed sentinel file for a site.
func apiDisarmSite(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}
	store := repo.New(ProjectRoot())
	if !store.SiteExists(name) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	if err := store.DisarmSite(name); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": false})
}
