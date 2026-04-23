package user

import (
	"testing"

	"github.com/skaia/backend/models"
)

func TestAdminEnableDisableTOTP(t *testing.T) {
	svc, cleanup := newTestService(t)
	defer cleanup()

	// Create a user
	user := &models.User{
		Username:    "testuser",
		Email:       "testuser@example.com",
		DisplayName: "Test User",
	}
	created, err := svc.repo.Create(user, "testpasshash")
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	targetID := created.ID

	// Admin enables TOTP (should set secret and enable)
	secret := "JBSWY3DPEHPK3PXP" // valid base32 for TOTP
	// Set secret only
	_, err = svc.AdminEnableTOTP(targetID, secret, "")
	if err != nil {
		t.Fatalf("admin enable totp (secret only) failed: %v", err)
	}
	// Disable TOTP
	err = svc.AdminDisableTOTP(targetID)
	if err != nil {
		t.Fatalf("admin disable totp failed: %v", err)
	}
	// Try disabling again (should error)
	err = svc.AdminDisableTOTP(targetID)
	if err == nil {
		t.Fatalf("expected error when disabling TOTP not enabled")
	}
}
