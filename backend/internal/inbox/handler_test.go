package inbox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	ictx "github.com/skaia/backend/internal/ctx"
	"github.com/skaia/backend/internal/jwt"
)

func TestGroupParticipantRoutesRejectMalformedIDs(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{
			name:   "lock malformed conversation",
			method: http.MethodPut,
			path:   "/inbox/conversations/not-a-number/lock",
			body:   `{"locked":true}`,
		},
		{
			name:   "kick malformed conversation",
			method: http.MethodDelete,
			path:   "/inbox/conversations/not-a-number/participants/2",
		},
		{
			name:   "kick malformed user",
			method: http.MethodDelete,
			path:   "/inbox/conversations/1/participants/not-a-number",
		},
		{
			name:   "mute malformed conversation",
			method: http.MethodPut,
			path:   "/inbox/conversations/not-a-number/participants/2/mute",
			body:   `{"muted":true}`,
		},
		{
			name:   "mute malformed user",
			method: http.MethodPut,
			path:   "/inbox/conversations/1/participants/not-a-number/mute",
			body:   `{"muted":true}`,
		},
		{
			name:   "role malformed conversation",
			method: http.MethodPut,
			path:   "/inbox/conversations/not-a-number/participants/2/role",
			body:   `{"role":"manager"}`,
		},
		{
			name:   "role malformed user",
			method: http.MethodPut,
			path:   "/inbox/conversations/1/participants/not-a-number/role",
			body:   `{"role":"manager"}`,
		},
	}

	h := NewHandler(nil, nil)
	router := chi.NewRouter()
	h.Mount(router, func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), ictx.CtxKeyClaims, &jwt.Claims{UserID: 42})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected status %d, got %d with body %s", http.StatusBadRequest, rec.Code, rec.Body.String())
			}
		})
	}
}
