package utils

import "testing"

func TestGetFrappeSiteNameUsesBaseDomainDirectly(t *testing.T) {
	t.Setenv("DOMAINS", "localhost")
	if got := GetFrappeSiteName(14); got != "site14.localhost" {
		t.Fatalf("GetFrappeSiteName(14) with localhost = %q, want %q", got, "site14.localhost")
	}

	t.Setenv("DOMAINS", "https://thewriterco.com")
	if got := GetFrappeSiteName(14); got != "site14.thewriterco.com" {
		t.Fatalf("GetFrappeSiteName(14) with production domain = %q, want %q", got, "site14.thewriterco.com")
	}
}
