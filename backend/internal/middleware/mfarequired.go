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
	ijwt "github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/utils"
)

const (
	mfaChallengePath = "/api/auth/mfa-challenge"
	mfaSessionTTL    = 24 * time.Hour
)

type mfaCodeRequest struct {
	TOTPCode   string `json:"totp_code"`
	BackupCode string `json:"backup_code"`
}

var errMFARequired = errors.New("MFA Required")

// MFARequiredMiddleware enforces MFA verification for authenticated users with TOTP enabled.
// It allows requests through if:
//   - The request is unauthenticated
//   - The user does not have TOTP enabled
//   - The user has already completed an MFA challenge within the last 24 hours
func MFARequiredMiddleware(authSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Bypass certain routes
			if r.URL.Path == "/api/auth/logout" || r.URL.Path == "/api/auth/refresh" {
				next.ServeHTTP(w, r)
				return
			}

			userID, ok := utils.UserIDFromCtx(r)
			if !ok {
				// Try to extract from Authorization header directly (since JWTAuthMiddleware runs later)
				authHeader := r.Header.Get("Authorization")
				if authHeader != "" {
					parts := strings.SplitN(authHeader, " ", 2)
					if len(parts) == 2 && parts[0] == "Bearer" {
						if claims, err := ijwt.ValidateToken(parts[1]); err == nil {
							userID = claims.UserID
							ok = true
						}
					}
				}
			}

			if !ok {
				next.ServeHTTP(w, r)
				return
			}

			_, totpEnabled, err := authSvc.GetTOTPEnabled(userID)
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
				utils.WriteError(w, http.StatusUnauthorized, err.Error())
				return
			}

			next.ServeHTTP(w, r)
		})
	}
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
		valid, err = authSvc.ValidateTOTPBackupCode(userID, req.BackupCode)
	} else {
		valid, err = authSvc.VerifyTOTP(userID, req.TOTPCode)
	}
	if err != nil || !valid {
		utils.WriteError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}

	if err := authSvc.SetMFARequired(userID, false); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to update MFA status")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// assertMFACleared returns nil if the user has a valid MFA session, otherwise errMFARequired.
// As a convenience, it also accepts an inline MFA code on the request body and clears
// the challenge if valid — allowing clients to piggyback verification on their first request.
func assertMFACleared(r *http.Request, authSvc *auth.Service, userID int64) error {
	mfaStatus, err := authSvc.GetMFARequired(userID)
	expired := !mfaStatus.UpdatedAt.IsZero() && time.Since(mfaStatus.UpdatedAt) > mfaSessionTTL
	if err != nil || mfaStatus.Required || expired {
		req, body, _ := readMFABody(r)
		r.Body = io.NopCloser(bytes.NewBuffer(body))
		if req != nil {
			var valid bool
			if req.BackupCode != "" {
				valid, _ = authSvc.ValidateTOTPBackupCode(userID, req.BackupCode)
			} else {
				valid, _ = authSvc.VerifyTOTP(userID, req.TOTPCode)
			}
			if valid {
				_ = authSvc.SetMFARequired(userID, false)
				return nil
			}
		}
		return errMFARequired
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
