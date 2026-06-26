package grpcserver

import (
	"context"
	"testing"

	pb "github.com/skaia/grpc/skaia"
)

func TestGetAppsReturnsAvailableCatalog(t *testing.T) {
	resp, err := (&GoFTWServer{}).GetApps(context.Background(), &pb.GetAppsRequest{})
	if err != nil {
		t.Fatalf("GetApps returned error: %v", err)
	}

	want := map[string]bool{
		"frappe":  true,
		"erpnext": true,
		"hrms":    true,
	}
	for _, app := range resp.GetApps() {
		delete(want, app)
	}
	for app := range want {
		t.Fatalf("GetApps did not include catalog app %q; got %#v", app, resp.GetApps())
	}
}
