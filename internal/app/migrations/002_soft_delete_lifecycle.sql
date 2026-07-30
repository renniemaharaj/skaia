ALTER TABLE frappe_sites
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_error_code VARCHAR(80);

ALTER TABLE frappe_clusters
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_error_code VARCHAR(80);

ALTER TABLE grengo_api_key_permissions
    ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMPTZ;

ALTER TABLE grengo_passcodes
    ALTER COLUMN salt_hex DROP NOT NULL,
    ALTER COLUMN hash_hex DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_frappe_sites_deleted_at
    ON frappe_sites(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_frappe_clusters_deleted_at
    ON frappe_clusters(deleted_at) WHERE deleted_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skaia_hard_delete_operator') THEN
    CREATE ROLE skaia_hard_delete_operator NOLOGIN;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION reject_grengo_hard_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT pg_has_role(session_user, 'skaia_hard_delete_operator', 'SET') THEN
    RAISE EXCEPTION 'hard delete rejected for %', TG_TABLE_NAME
      USING ERRCODE='42501', HINT='Use the control-plane lifecycle operation.';
  END IF;
  RETURN OLD;
END
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'grengo_passcodes','frappe_clusters','frappe_sites',
    'grengo_api_keys','grengo_api_key_permissions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS grengo_reject_hard_delete ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER grengo_reject_hard_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_grengo_hard_delete()',
      table_name
    );
  END LOOP;
END
$$;
