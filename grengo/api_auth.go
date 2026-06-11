package main

import (
	"encoding/json"
	"net/http"
)

// ---------------------------------------------------------------------------
// Passcode verification endpoints
// ---------------------------------------------------------------------------

// apiVerifyPasscode checks a passcode pair against the stored .pcode file.
func apiVerifyPasscode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		P1 string `json:"p1"`
		P2 string `json:"p2"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid json")
		return
	}

	configured := passcodeConfigured()
	if !configured {
		apiJSON(w, http.StatusOK, map[string]any{
			"configured": false,
			"valid":      false,
		})
		return
	}

	valid := verifyPasscode(req.P1, req.P2)
	apiJSON(w, http.StatusOK, map[string]any{
		"configured": true,
		"valid":      valid,
	})
}

// apiPasscodeStatus reports whether a passcode is configured.
func apiPasscodeStatus(w http.ResponseWriter, r *http.Request) {
	apiJSON(w, http.StatusOK, map[string]any{
		"configured": passcodeConfigured(),
	})
}
