package app

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
)

func apiWebhookGithub(w http.ResponseWriter, r *http.Request) {
	event := r.Header.Get("X-GitHub-Event")
	if event != "" && event != "push" && event != "ping" {
		apiError(w, http.StatusBadRequest, "unsupported event")
		return
	}

	if event == "ping" {
		apiJSON(w, http.StatusOK, map[string]string{"status": "pong"})
		return
	}

	var payload struct {
		Ref     string `json:"ref"`
		Commits []struct {
			Added    []string `json:"added"`
			Removed  []string `json:"removed"`
			Modified []string `json:"modified"`
		} `json:"commits"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		apiError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	if payload.Ref != "" && payload.Ref != "refs/heads/main" {
		apiJSON(w, http.StatusOK, map[string]string{"status": "ignored push to non-main branch"})
		return
	}

	hasFrontendCode := false
	hasBackendCode := false

	for _, commit := range payload.Commits {
		allFiles := append(commit.Added, commit.Removed...)
		allFiles = append(allFiles, commit.Modified...)

		for _, file := range allFiles {
			ext := filepath.Ext(file)

			// Neutral files (.md, .tip, no extension) — skip classification
			if ext == ".md" || ext == ".tip" || ext == "" {
				continue
			}

			// Code inside backend/frontend/ is frontend
			if strings.HasPrefix(file, "backend/frontend/") {
				hasFrontendCode = true
				continue
			}

			// Any other file with a real extension is backend/infra
			hasBackendCode = true
		}
	}

	if hasBackendCode {
		log("Push contains backend changes. Skipping automatic frontend deployment.")
		apiJSON(w, http.StatusOK, map[string]string{"status": "ignored due to backend changes"})
		return
	}

	if !hasFrontendCode {
		log("Push contains only documentation changes. Nothing to deploy.")
		apiJSON(w, http.StatusOK, map[string]string{"status": "no deployable changes"})
		return
	}

	log("Received webhook trigger, shipping frontend...")
	
	// Run in background so webhook responds immediately
	go func() {
		defer func() {
			if r := recover(); r != nil {
				warn("Webhook ship panicked: %v", r)
			}
		}()
		cmdShipFrontend()
	}()

	apiJSON(w, http.StatusAccepted, map[string]string{"status": "deploying frontend"})
}
