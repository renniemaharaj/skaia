package main

import (
	"net/http"
	"strings"

	grengoapi "github.com/skaia/grengo/internal/api"
	"github.com/skaia/grengo/internal/app"
)

func newAPIRouter(handlers app.APIHandlers) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", apiHealth)
	mux.HandleFunc("GET /sites", handlers.ListSites)
	mux.HandleFunc("GET /stats", handlers.Stats)
	mux.HandleFunc("GET /storage", handlers.Storage)
	mux.HandleFunc("GET /sysinfo", handlers.SysInfo)
	mux.HandleFunc("GET /env/{name}", handlers.GetEnv)
	mux.HandleFunc("PUT /env/{name}", handlers.PutEnv)
	mux.HandleFunc("POST /exec", handlers.Exec)
	mux.HandleFunc("POST /frappe/provision", handlers.FrappeProvision)
	mux.HandleFunc("GET /export/{name}", handlers.ExportSite)
	mux.HandleFunc("POST /import", handlers.ImportSite)
	mux.HandleFunc("POST /sites/{name}/arm", handlers.ArmSite)
	mux.HandleFunc("POST /sites/{name}/disarm", handlers.DisarmSite)
	mux.HandleFunc("POST /sites/{name}/migrate", handlers.MigrateSite)
	mux.HandleFunc("POST /migrate-all", handlers.MigrateAll)
	mux.HandleFunc("POST /export-node", handlers.ExportNode)
	mux.HandleFunc("POST /import-node", handlers.ImportNode)
	mux.HandleFunc("GET /jobs", handlers.ListJobs)
	mux.HandleFunc("GET /jobs/{id}", handlers.GetJob)
	mux.HandleFunc("GET /jobs/{id}/download", handlers.DownloadJob)
	mux.HandleFunc("GET /exports", handlers.ListExports)
	mux.HandleFunc("GET /exports/{filename}/download", handlers.DownloadExport)
	mux.HandleFunc("DELETE /exports/{filename}", handlers.DeleteExport)
	mux.HandleFunc("GET /ws", handlers.WebSocket)
	mux.HandleFunc("POST /verify-passcode", handlers.VerifyPasscode)
	mux.HandleFunc("GET /passcode/status", handlers.PasscodeStatus)
	mux.HandleFunc("POST /webhook/github", handlers.WebhookGithub)
	return mux
}

func apiHealth(w http.ResponseWriter, r *http.Request) {
	grengoapi.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func apiPasscodeMiddleware(next http.Handler) http.Handler {
	openPaths := map[string]bool{
		"/health":          true,
		"/verify-passcode": true,
		"/passcode/status": true,
		"/ws":              true,
		"/storage":         true,
		"/webhook/github":  true,
		"/frappe/provision": true,
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if openPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}

		if !app.PasscodeConfigured() {
			next.ServeHTTP(w, r)
			return
		}

		header := r.Header.Get("X-Grengo-Passcode")
		if header == "" {
			grengoapi.WriteError(w, http.StatusUnauthorized, "passcode required")
			return
		}

		parts := strings.SplitN(header, ":", 2)
		if len(parts) != 2 || !app.VerifyPasscode(parts[0], parts[1]) {
			grengoapi.WriteError(w, http.StatusUnauthorized, "invalid passcode")
			return
		}

		next.ServeHTTP(w, r)
	})
}
