package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

const (
	mfaChallengePath = "/api/auth/mfa-challenge"
	mfaSessionTTL    = 24 * time.Hour
)

type mfaCodeRequest struct {
	TOTPCode   string `json:"totp_code"`
	BackupCode string `json:"backup_code"`
}

type mfaRequiredError struct {
	status models.MFAChallengeStatus
}

func (e *mfaRequiredError) Error() string { return "MFA Required" }

// MFARequiredMiddleware enforces MFA verification for authenticated users with TOTP enabled.
// It allows requests through if:
//   - The request is unauthenticated
//   - The user does not have TOTP enabled
//   - The user has already completed an MFA challenge within the last 24 hours
func MFARequiredMiddleware(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Bypass certain routes
			if r.URL.Path == "/api/auth/logout" ||
				r.URL.Path == "/api/auth/refresh" ||
				strings.HasPrefix(r.URL.Path, "/api/auth/admin/recovery-requests/") ||
				strings.HasPrefix(r.URL.Path, "/api/grengo/s/") {
				next.ServeHTTP(w, r)
				return
			}

			userID, ok := utils.UserIDFromCtx(r)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}

			_, totpEnabled, err := authSvc.GetTOTPEnabled(r.Context(), userID)
			if err != nil {
				utils.WriteError(w, http.StatusInternalServerError, "internal server error")
				return
			}
			if !totpEnabled {
				next.ServeHTTP(w, r)
				return
			}

			if r.URL.Path == mfaChallengePath && r.Method == http.MethodPost {
				handleMFAChallenge(w, r, authSvc, userID)
				return
			}

			if err := assertMFACleared(r, authSvc, userID); err != nil {
				var required *mfaRequiredError
				if errors.As(err, &required) {
					writeMFARequired(w, required.status)
					return
				}
				utils.WriteError(w, http.StatusInternalServerError, "failed to verify MFA status")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeMFARequired(w http.ResponseWriter, status models.MFAChallengeStatus) {
	reason := status.Reason
	if reason == "" {
		reason = auth.MFAReasonAuthenticationRequired
	}
	utils.WriteJSON(w, http.StatusUnauthorized, map[string]interface{}{
		"error":       "MFA Required",
		"challenge":   "totp",
		"reason_code": reason,
		"action":      status.Action,
	})
}

// handleMFAChallenge processes the dedicated MFA verification endpoint.
func handleMFAChallenge(w http.ResponseWriter, r *http.Request, authSvc *auth.Service, userID int64) {
	req, body, err := readMFABody(r)
	r.Body = io.NopCloser(bytes.NewBuffer(body))
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var valid bool
	if req.BackupCode != "" {
		valid, err = authSvc.ValidateTOTPBackupCode(r.Context(), userID, req.BackupCode)
	} else {
		valid, err = authSvc.VerifyTOTP(r.Context(), userID, req.TOTPCode)
	}
	if err != nil || !valid {
		utils.WriteError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}

	if err := authSvc.SetMFARequired(r.Context(), userID, false); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to update MFA status")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// assertMFACleared returns nil if the user has a valid MFA session, otherwise errMFARequired.
// As a convenience, it also accepts an inline MFA code on the request body and clears
// the challenge if valid - allowing clients to piggyback verification on their first request.
func assertMFACleared(r *http.Request, authSvc *auth.Service, userID int64) error {
	mfaStatus, err := authSvc.GetMFARequired(r.Context(), userID)
	expired := !mfaStatus.UpdatedAt.IsZero() && time.Since(mfaStatus.UpdatedAt) > mfaSessionTTL
	if err != nil || mfaStatus.Required || expired {
		req, body, _ := readMFABody(r)
		r.Body = io.NopCloser(bytes.NewBuffer(body))
		if req != nil {
			var valid bool
			if req.BackupCode != "" {
				valid, _ = authSvc.ValidateTOTPBackupCode(r.Context(), userID, req.BackupCode)
			} else {
				valid, _ = authSvc.VerifyTOTP(r.Context(), userID, req.TOTPCode)
			}
			if valid {
				_ = authSvc.SetMFARequired(r.Context(), userID, false)
				return nil
			}
		}
		if err != nil {
			return err
		}
		if expired && !mfaStatus.Required {
			mfaStatus.Reason = auth.MFAReasonSessionExpired
			mfaStatus.Action = ""
		}
		return &mfaRequiredError{status: mfaStatus}
	}
	return nil
}

// readMFABody reads the request body and decodes it into an mfaCodeRequest.
// The raw bytes are always returned so callers can restore r.Body.
func readMFABody(r *http.Request) (*mfaCodeRequest, []byte, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, nil, errors.New("failed to read request body")
	}

	var req mfaCodeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return nil, body, errors.New("invalid JSON")
	}

	if req.TOTPCode == "" && req.BackupCode == "" {
		return nil, body, errors.New("totp_code or backup_code required")
	}

	return &req, body, nil
}
