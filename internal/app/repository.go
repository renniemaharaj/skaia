package app

import (
	"fmt"
	"strings"
)

const grengoDatabaseName = "grengo"

type grengoRepository struct {
	dbName string
}

type frappeAllocation struct {
	Version      string
	Branch       string
	ClusterIndex int
	HTTPPort     int
	GRPCPort     int
	SiteName     string
}

func newGrengoRepository() grengoRepository {
	return grengoRepository{dbName: grengoDatabaseName}
}

func (r grengoRepository) queryScalar(query string) (string, error) {
	env := loadSharedEnv()
	out, err := dockerExecOutput("skaia-postgres", "psql", "-U", env.PostgresUser, "-d", r.dbName, "-tAc", query)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (r grengoRepository) execSQL(sql []byte) error {
	env := loadSharedEnv()
	return dockerExecInput("skaia-postgres", sql, "psql", "-v", "ON_ERROR_STOP=1", "-U", env.PostgresUser, "-d", r.dbName)
}

func (r grengoRepository) StorePasscode(encoded string) error {
	parts := strings.SplitN(strings.TrimSpace(encoded), ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return fmt.Errorf("invalid passcode payload")
	}

	sql := fmt.Sprintf(`
INSERT INTO grengo_passcodes (id, salt_hex, hash_hex, updated_at)
VALUES (TRUE, %s, %s, NOW())
ON CONFLICT (id) DO UPDATE
SET salt_hex = EXCLUDED.salt_hex,
    hash_hex = EXCLUDED.hash_hex,
    updated_at = NOW();
`, sqlLiteral(parts[0]), sqlLiteral(parts[1]))
	return r.execSQL([]byte(sql))
}

func (r grengoRepository) LoadPasscode() (string, error) {
	return r.queryScalar(`SELECT salt_hex || ':' || hash_hex FROM grengo_passcodes WHERE id = TRUE`)
}

func (r grengoRepository) ClearPasscode() error {
	return r.execSQL([]byte(`DELETE FROM grengo_passcodes WHERE id = TRUE;`))
}

func (r grengoRepository) RecordFrappeAllocation(record frappeAllocation) error {
	if record.Version == "" || record.ClusterIndex <= 0 || record.SiteName == "" {
		return fmt.Errorf("invalid frappe allocation")
	}

	sql := grengoTransactionSQL(
		r.lockFrappeSiteSQL(record),
		r.lockFrappeClusterSQL(record),
		r.prepareFrappeAllocationSQL(),
		r.capturePreviousFrappeClusterSQL(record),
		r.upsertFrappeClusterSQL(record),
		r.upsertFrappeSiteSQL(record),
		r.refreshFrappeClusterSiteCountSQL(),
	)
	return r.execSQL([]byte(sql))
}

func (r grengoRepository) lockFrappeSiteSQL(record frappeAllocation) string {
	key := fmt.Sprintf("frappe_site:%s", record.SiteName)
	return fmt.Sprintf("SELECT pg_advisory_xact_lock(hashtext(%s)::bigint);", sqlLiteral(key))
}

func (r grengoRepository) lockFrappeClusterSQL(record frappeAllocation) string {
	key := fmt.Sprintf("frappe_allocation:%s:%d", record.Version, record.ClusterIndex)
	return fmt.Sprintf("SELECT pg_advisory_xact_lock(hashtext(%s)::bigint);", sqlLiteral(key))
}

func (r grengoRepository) prepareFrappeAllocationSQL() string {
	return `
CREATE TEMP TABLE frappe_allocation_cluster (
  id BIGINT PRIMARY KEY
) ON COMMIT DROP;

CREATE TEMP TABLE frappe_allocation_previous_cluster (
  id BIGINT PRIMARY KEY
) ON COMMIT DROP;`
}

func (r grengoRepository) capturePreviousFrappeClusterSQL(record frappeAllocation) string {
	return fmt.Sprintf(`
INSERT INTO frappe_allocation_previous_cluster (id)
SELECT cluster_id
FROM frappe_sites
WHERE site_name = %s
FOR UPDATE;`, sqlLiteral(record.SiteName))
}

func (r grengoRepository) upsertFrappeClusterSQL(record frappeAllocation) string {
	status := "active"
	containerName := fmt.Sprintf("skaia_frappe_cluster_%s_%d", strings.ReplaceAll(record.Version, "-", "_"), record.ClusterIndex)
	return fmt.Sprintf(`
WITH upserted_cluster AS (
  INSERT INTO frappe_clusters (
    version, branch, cluster_index, http_port, grpc_port, container_name, capacity, status, updated_at
  )
  VALUES (%s, %s, %d, %d, %d, %s, %d, %s, NOW())
  ON CONFLICT (version, cluster_index) DO UPDATE SET
    branch = EXCLUDED.branch,
    http_port = EXCLUDED.http_port,
    grpc_port = EXCLUDED.grpc_port,
    container_name = EXCLUDED.container_name,
    capacity = EXCLUDED.capacity,
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO frappe_allocation_cluster (id)
SELECT id FROM upserted_cluster;`,
		sqlLiteral(record.Version), sqlLiteral(record.Branch), record.ClusterIndex, record.HTTPPort, record.GRPCPort,
		sqlLiteral(containerName), maxFrappeSitesPerCluster, sqlLiteral(status))
}

func (r grengoRepository) upsertFrappeSiteSQL(record frappeAllocation) string {
	status := "active"
	return fmt.Sprintf(`
INSERT INTO frappe_sites (site_name, cluster_id, version, status, updated_at)
SELECT %s, id, %s, %s, NOW()
FROM frappe_allocation_cluster
ON CONFLICT (site_name) DO UPDATE SET
  cluster_id = EXCLUDED.cluster_id,
  version = EXCLUDED.version,
  status = EXCLUDED.status,
  updated_at = NOW();`,
		sqlLiteral(record.SiteName), sqlLiteral(record.Version), sqlLiteral(status))
}

func (r grengoRepository) refreshFrappeClusterSiteCountSQL() string {
	return `
UPDATE frappe_clusters fc
SET site_count = COALESCE((
    SELECT COUNT(*) FROM frappe_sites fs
    WHERE fs.cluster_id = fc.id AND fs.status <> 'deleted'
  ), 0),
  updated_at = NOW()
WHERE fc.id IN (
  SELECT id FROM frappe_allocation_cluster
  UNION
  SELECT id FROM frappe_allocation_previous_cluster
);`
}

func grengoTransactionSQL(statements ...string) string {
	var b strings.Builder
	b.WriteString("BEGIN;\n")
	b.WriteString("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n")
	for _, statement := range statements {
		b.WriteString(strings.TrimSpace(statement))
		b.WriteString("\n")
	}
	b.WriteString("COMMIT;\n")
	return b.String()
}
