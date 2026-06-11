package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Site listing, env, arm/disarm
// ---------------------------------------------------------------------------

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
	entries, err := os.ReadDir(backendsDir())
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
		ef := filepath.Join(backendsDir(), e.Name(), ".env")
		if _, serr := os.Stat(ef); serr != nil {
			continue
		}

		name := envVal(ef, "CLIENT_NAME")
		port := envVal(ef, "PORT")
		domainsStr := envVal(ef, "DOMAINS")
		dbName := envVal(ef, "POSTGRES_DB")
		features := envVal(ef, "FEATURES_ENABLED")

		status := "enabled"
		if _, serr := os.Stat(filepath.Join(backendsDir(), e.Name(), ".disabled")); serr == nil {
			status = "disabled"
		}

		running := clientRunning(name)

		// Check armed status: look for any .armed file inside the client's armed/ dir.
		armedDir := filepath.Join(backendsDir(), e.Name(), "armed")
		armed := false
		if aEntries, aerr := os.ReadDir(armedDir); aerr == nil {
			for _, ae := range aEntries {
				if !ae.IsDir() {
					armed = true
					break
				}
			}
		}

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

// ---------------------------------------------------------------------------
// Site .env read/write
// ---------------------------------------------------------------------------

func apiGetEnv(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}

	envFile := filepath.Join(backendsDir(), name, ".env")
	data, err := os.ReadFile(envFile)
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

	envFile := filepath.Join(backendsDir(), name, ".env")
	if _, err := os.Stat(envFile); os.IsNotExist(err) {
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

	if err := os.WriteFile(envFile, []byte(body.Content), 0644); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---------------------------------------------------------------------------
// Arm / Disarm
// ---------------------------------------------------------------------------

// apiArmSite creates a .armed sentinel file in the site's armed/ directory.
func apiArmSite(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		apiError(w, http.StatusBadRequest, "name required")
		return
	}
	siteDir := filepath.Join(backendsDir(), name)
	if _, err := os.Stat(siteDir); os.IsNotExist(err) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	armedDir := filepath.Join(siteDir, "armed")
	if err := os.MkdirAll(armedDir, 0755); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	armedFile := filepath.Join(armedDir, name+".armed")
	if err := os.WriteFile(armedFile, []byte(time.Now().UTC().Format(time.RFC3339)), 0644); err != nil {
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
	siteDir := filepath.Join(backendsDir(), name)
	if _, err := os.Stat(siteDir); os.IsNotExist(err) {
		apiError(w, http.StatusNotFound, fmt.Sprintf("site '%s' not found", name))
		return
	}

	armedDir := filepath.Join(siteDir, "armed")
	armedFile := filepath.Join(armedDir, name+".armed")
	if err := os.Remove(armedFile); err != nil && !os.IsNotExist(err) {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	apiJSON(w, http.StatusOK, map[string]any{"ok": true, "armed": false})
}
