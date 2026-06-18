package datasource

import (
	"net/http/httptest"
	"testing"
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
