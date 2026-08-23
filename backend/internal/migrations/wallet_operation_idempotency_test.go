package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestWalletOperationIdempotencyHasFreshAndIncrementalParity(t *testing.T) {
	fresh, err := os.ReadFile("001_schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	incremental, err := os.ReadFile("038_wallet_operation_idempotency.sql")
	if err != nil {
		t.Fatal(err)
	}

	for _, contract := range []string{
		"operation_scope",
		"operation_key_hash",
		"operation_payload_hash",
		"idx_user_wallet_operation_once",
		"amount > 0",
		"'credit', 'debit'",
	} {
		if !strings.Contains(string(fresh), contract) {
			t.Errorf("fresh schema missing wallet operation contract %q", contract)
		}
		if !strings.Contains(string(incremental), contract) {
			t.Errorf("migration 038 missing wallet operation contract %q", contract)
		}
	}
}
