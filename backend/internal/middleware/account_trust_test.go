package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	ictx "github.com/skaia/backend/internal/ctx"
	"github.com/skaia/backend/internal/jwt"
	"github.com/skaia/backend/internal/security"
	"github.com/skaia/backend/models"
)

type boundaryUsers struct{ createdAt time.Time }

func (f boundaryUsers) GetByID(id int64) (*models.User, error) {
	return &models.User{ID: id, CreatedAt: f.createdAt}, nil
}

type boundaryTOTP struct{ enabled bool }

func (f boundaryTOTP) GetTOTPEnabled(context.Context, int64) (string, bool, error) {
	return "", f.enabled, nil
}

func authenticatedRequest(method, path string, userID int64) *http.Request {
	req := httptest.NewRequest(method, path, nil)
	claims := &jwt.Claims{UserID: userID}
	ctx := context.WithValue(req.Context(), ictx.CtxKeyClaims, claims)
	return req.WithContext(ctx)
}

func TestAccountTrustBoundaryDeniesBeforeHandler(t *testing.T) {
	policy := security.NewAccountTrustPolicy(boundaryUsers{createdAt: time.Now()}, boundaryTOTP{})
	called := false
	handler := AccountTrustBoundary(policy)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authenticatedRequest(http.MethodPost, "/api/forum/threads", 9))
	if called {
		t.Fatal("provisional request reached handler")
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["reason_code"] != security.ReasonAccountProvisional {
		t.Fatalf("response = %v", body)
	}
}

func TestAccountTrustBoundaryExceptions(t *testing.T) {
	policy := security.NewAccountTrustPolicy(boundaryUsers{createdAt: time.Now()}, boundaryTOTP{})
	tests := []struct {
		name string
		req  *http.Request
	}{
		{name: "guest register", req: httptest.NewRequest(http.MethodPost, "/api/auth/register", nil)},
		{name: "guest batch read", req: httptest.NewRequest(http.MethodPost, "/api/users/batch", nil)},
		{name: "guest page view", req: httptest.NewRequest(http.MethodPost, "/api/pages/home/view", nil)},
		{name: "guest thread view", req: httptest.NewRequest(http.MethodPost, "/api/forum/threads/7/view", nil)},
		{name: "guest datasource render", req: httptest.NewRequest(http.MethodPost, "/api/config/datasources/7/execute", nil)},
		{name: "guest route voice token", req: httptest.NewRequest(http.MethodPost, "/api/voice/livekit-token", nil)},
		{name: "guest order lookup", req: httptest.NewRequest(http.MethodPost, "/api/store/orders/guest-lookup", nil)},
		{name: "provisional totp", req: authenticatedRequest(http.MethodPost, "/api/auth/totp/setup", 9)},
		{name: "provisional own profile", req: authenticatedRequest(http.MethodPut, "/api/users/9", 9)},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			handler := AccountTrustBoundary(policy)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
			handler.ServeHTTP(httptest.NewRecorder(), tc.req)
			if !called {
				t.Fatal("reviewed exception was denied")
			}
		})
	}
}

func TestAccountTrustBoundaryRejectsUnreviewedGuestAndProvisionalWrites(t *testing.T) {
	policy := security.NewAccountTrustPolicy(boundaryUsers{createdAt: time.Now()}, boundaryTOTP{})
	tests := []struct {
		name string
		req  *http.Request
	}{
		{name: "guest checkout", req: httptest.NewRequest(http.MethodPost, "/api/store/checkout", nil)},
		{name: "guest thread creation", req: httptest.NewRequest(http.MethodPost, "/api/forum/threads", nil)},
		{name: "provisional thread creation", req: authenticatedRequest(http.MethodPost, "/api/forum/threads", 9)},
		{name: "provisional other profile", req: authenticatedRequest(http.MethodPut, "/api/users/10", 9)},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			handler := AccountTrustBoundary(policy)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, tc.req)
			if called {
				t.Fatal("unreviewed write reached handler")
			}
			if recorder.Code != http.StatusUnauthorized && recorder.Code != http.StatusForbidden {
				t.Fatalf("status = %d", recorder.Code)
			}
		})
	}
}

func TestAccountTrustBoundaryAllowsEstablished(t *testing.T) {
	policy := security.NewAccountTrustPolicy(boundaryUsers{createdAt: time.Now().Add(-time.Hour)}, boundaryTOTP{})
	called := false
	handler := AccountTrustBoundary(policy)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))
	handler.ServeHTTP(httptest.NewRecorder(), authenticatedRequest(http.MethodDelete, "/api/inbox/messages/1", 9))
	if !called {
		t.Fatal("established request was denied")
	}
}
