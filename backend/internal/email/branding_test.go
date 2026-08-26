package email

import (
	"strings"
	"testing"
)

func TestSurfaceBrandingDefaultsAndTenantOverrides(t *testing.T) {
	t.Setenv("SITE_NAME", "")
	t.Setenv("CLIENT_NAME", "")
	if got := siteName(); got != "Go Web Platform" {
		t.Fatalf("siteName() = %q, want Go Web Platform", got)
	}
	if html := VerifyEmailHTML("reader", "token"); !strings.Contains(html, "Go Web Platform") {
		t.Fatal("default transactional email does not show Go Web Platform")
	}

	t.Setenv("SITE_NAME", "Example Tenant")
	if got := siteName(); got != "Example Tenant" {
		t.Fatalf("siteName() = %q, want tenant override", got)
	}
	if html := VerifyEmailHTML("reader", "token"); strings.Contains(html, "Go Web Platform") || !strings.Contains(html, "Example Tenant") {
		t.Fatal("tenant site name did not remain authoritative in transactional email")
	}
}

func TestSenderUsesGoWebPlatformOnlyAsFinalFallback(t *testing.T) {
	t.Setenv("SMTP_HOST", "smtp.example.test")
	t.Setenv("SMTP_FROM_NAME", "")
	t.Setenv("CLIENT_NAME", "")
	t.Setenv("DOMAINS", "")
	if sender := NewSenderFromEnv(); sender == nil || sender.fromName != "Go Web Platform" {
		t.Fatalf("default sender = %#v, want Go Web Platform", sender)
	}

	t.Setenv("CLIENT_NAME", "writer_co")
	if sender := NewSenderFromEnv(); sender == nil || sender.fromName != "Writer_co" {
		t.Fatalf("client sender = %#v, want client-derived override", sender)
	}
}
