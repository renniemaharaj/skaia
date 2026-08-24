package datasource

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	ictx "github.com/skaia/backend/internal/ctx"
	ijwt "github.com/skaia/backend/internal/jwt"
)

func TestWantsAsync(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/config/datasources/1/execute?async=true", nil)
	if !wantsAsync(req) {
		t.Fatal("expected async query to request async execution")
	}

	req = httptest.NewRequest("POST", "/api/config/datasources/1/execute", nil)
	req.Header.Set("Prefer", "respond-async")
	if !wantsAsync(req) {
		t.Fatal("expected Prefer header to request async execution")
	}

	req = httptest.NewRequest("POST", "/api/config/datasources/1/execute", nil)
	if wantsAsync(req) {
		t.Fatal("did not expect async execution")
	}
}

func TestPreviewRouteUsesManagementPolicyBeforeDispatch(t *testing.T) {
	passthrough := func(next http.Handler) http.Handler { return next }
	tests := []struct {
		name   string
		policy managementPolicyStub
		status int
	}{
		{name: "permission denied", policy: managementPolicyStub{}, status: http.StatusForbidden},
		{name: "allowed but queue unavailable", policy: managementPolicyStub{allowed: true}, status: http.StatusServiceUnavailable},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := NewHandler(NewService(nil, test.policy), nil, nil, nil, nil, nil)
			router := chi.NewRouter()
			handler.Mount(router, passthrough, passthrough, passthrough)

			request := httptest.NewRequest(
				http.MethodPost,
				"/config/datasources/preview",
				strings.NewReader(`{"files":{"main.ts":"return [];"}}`),
			)
			request = request.WithContext(context.WithValue(
				request.Context(),
				ictx.CtxKeyClaims,
				&ijwt.Claims{UserID: 7},
			))
			recorder := httptest.NewRecorder()

			router.ServeHTTP(recorder, request)
			if recorder.Code != test.status {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, test.status, recorder.Body.String())
			}
		})
	}
}

func TestValidatePreviewRequest(t *testing.T) {
	valid := previewRequest{Files: map[string]string{"main.ts": "return [];"}}
	if err := validatePreviewRequest(valid); err != nil {
		t.Fatalf("valid request rejected: %v", err)
	}

	invalid := []previewRequest{
		{},
		{Files: map[string]string{"../main.ts": "return [];"}},
		{Files: map[string]string{"main.js": "return [];"}},
		{Files: map[string]string{"main.ts": "return [];"}, EnvData: strings.Repeat("x", maxPreviewEnvBytes+1)},
	}
	for _, request := range invalid {
		if err := validatePreviewRequest(request); err == nil {
			t.Fatalf("invalid request accepted: %#v", request)
		}
	}
}
