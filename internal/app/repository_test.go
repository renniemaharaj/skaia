package app

import (
	"strings"
	"testing"
)

func TestFrappeAllocationSQLUsesTransactionAndLocks(t *testing.T) {
	repo := newGrengoRepository()
	record := frappeAllocation{
		Version:      "16",
		Branch:       "version-16",
		ClusterIndex: 1,
		HTTPPort:     8160,
		GRPCPort:     3161,
		SiteName:     "example.localhost",
	}

	sql := grengoTransactionSQL(
		repo.lockFrappeSiteSQL(record),
		repo.lockFrappeClusterSQL(record),
		repo.prepareFrappeAllocationSQL(),
		repo.capturePreviousFrappeClusterSQL(record),
		repo.upsertFrappeClusterSQL(record),
		repo.upsertFrappeSiteSQL(record),
		repo.refreshFrappeClusterSiteCountSQL(),
	)

	checks := []string{
		"BEGIN;",
		"SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;",
		"SELECT pg_advisory_xact_lock",
		"CREATE TEMP TABLE frappe_allocation_previous_cluster",
		"FOR UPDATE;",
		"INSERT INTO frappe_clusters",
		"INSERT INTO frappe_sites",
		"UNION\n  SELECT id FROM frappe_allocation_previous_cluster",
		"COMMIT;",
	}
	for _, check := range checks {
		if !strings.Contains(sql, check) {
			t.Fatalf("allocation SQL missing %q:\n%s", check, sql)
		}
	}
}
