package app

import (
	"net/http"
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
