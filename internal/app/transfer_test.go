package app

import (
	"net/url"
	"testing"
)

func TestDestinationDatabaseURLUsesLocalSharedCredentials(t *testing.T) {
	shared := SharedEnv{
		PostgresUser:     "local@user",
		PostgresPassword: "p:/@ss word",
		PGPort:           "5433",
	}

	raw := destinationDatabaseURL(shared, "writer-db")
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Scheme != "postgres" || parsed.Host != "postgres:5433" || parsed.Path != "/writer-db" {
		t.Fatalf("unexpected destination URL: %s", raw)
	}
	if parsed.User.Username() != shared.PostgresUser {
		t.Fatalf("username = %q, want %q", parsed.User.Username(), shared.PostgresUser)
	}
	password, ok := parsed.User.Password()
	if !ok || password != shared.PostgresPassword {
		t.Fatal("destination URL did not preserve the local password safely")
	}
	if parsed.Query().Get("sslmode") != "disable" {
		t.Fatalf("sslmode = %q, want disable", parsed.Query().Get("sslmode"))
	}
}
