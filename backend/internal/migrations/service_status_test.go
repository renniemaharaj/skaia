package migrations

import (
	"os"
	"strings"
	"testing"
)

func TestServiceStatusMigrationContract(t *testing.T) {
	data, err := os.ReadFile("040_service_status.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(data)
	for _, required := range []string{
		"CREATE TABLE IF NOT EXISTS service_incidents",
		"CREATE TABLE IF NOT EXISTS service_incident_events",
		"CREATE TRIGGER skaia_reject_hard_delete",
		"state <> 'draft'",
		"ON DELETE RESTRICT",
	} {
		if !strings.Contains(sql, required) {
			t.Errorf("migration 040 missing %q", required)
		}
	}
	baseline, err := os.ReadFile("001_schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"service_incidents", "service_incident_events"} {
		if !strings.Contains(string(baseline), "CREATE TABLE IF NOT EXISTS "+table) {
			t.Errorf("fresh schema missing %s", table)
		}
	}
}
