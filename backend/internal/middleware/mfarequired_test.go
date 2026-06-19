package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/skaia/backend/internal/auth"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWriteMFARequiredIncludesChallengeContext(t *testing.T) {
	w := httptest.NewRecorder()

	writeMFARequired(w, models.MFAChallengeStatus{
		Required: true,
		Reason:   auth.MFAReasonSensitiveAction,
		Action:   "revoke session",
	})

	require.Equal(t, http.StatusUnauthorized, w.Code)
	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, "MFA Required", response["error"])
	assert.Equal(t, "totp", response["challenge"])
	assert.Equal(t, auth.MFAReasonSensitiveAction, response["reason_code"])
	assert.Equal(t, "revoke session", response["action"])
}

func TestWriteMFARequiredDefaultsMissingReason(t *testing.T) {
	w := httptest.NewRecorder()

	writeMFARequired(w, models.MFAChallengeStatus{Required: true})

	var response map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	assert.Equal(t, auth.MFAReasonAuthenticationRequired, response["reason_code"])
}
