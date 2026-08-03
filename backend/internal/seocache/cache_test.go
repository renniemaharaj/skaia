package seocache

import "testing"

func TestRouteKeyIsTenantScopedAndVersioned(t *testing.T) {
	t.Setenv("CLIENT_NAME", "writer")
	if got, want := RouteKey("/forum"), "writer:seo:meta:v3:/forum"; got != want {
		t.Fatalf("RouteKey() = %q, want %q", got, want)
	}
}
