package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestStoreCheckoutFulfilmentHasFreshAndIncrementalParity(t *testing.T) {
	fresh, err := os.ReadFile("001_schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	incremental, err := os.ReadFile("039_store_checkout_fulfilment.sql")
	if err != nil {
		t.Fatal(err)
	}

	for _, contract := range []string{
		"store_checkout_operations",
		"UNIQUE (user_id, key_hash)",
		"store_order_fulfilments",
		"store_payment_events",
		"UNIQUE (provider, event_id_hash)",
		"UNIQUE (order_item_id, action_index)",
		"lease_expires_at",
		"idx_store_order_fulfilments_claim",
		"idx_payments_order_once",
		"idx_payments_provider_ref",
	} {
		if !strings.Contains(string(fresh), contract) {
			t.Errorf("fresh schema missing checkout/fulfilment contract %q", contract)
		}
		if !strings.Contains(string(incremental), contract) {
			t.Errorf("migration 039 missing checkout/fulfilment contract %q", contract)
		}
	}
}
