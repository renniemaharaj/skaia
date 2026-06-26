CREATE TABLE IF NOT EXISTS grengo_passcodes (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  salt_hex TEXT NOT NULL CHECK (length(salt_hex) >= 16),
  hash_hex TEXT NOT NULL CHECK (length(hash_hex) >= 32),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id)
);

CREATE TABLE IF NOT EXISTS frappe_clusters (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  branch TEXT NOT NULL,
  cluster_index INTEGER NOT NULL,
  http_port INTEGER NOT NULL,
  grpc_port INTEGER NOT NULL,
  container_name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 50 CHECK (capacity > 0),
  site_count INTEGER NOT NULL DEFAULT 0 CHECK (site_count >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version, cluster_index),
  UNIQUE (http_port),
  UNIQUE (grpc_port)
);

CREATE INDEX IF NOT EXISTS idx_frappe_clusters_allocatable
  ON frappe_clusters (version, status, site_count, capacity);

CREATE TABLE IF NOT EXISTS frappe_sites (
  id BIGSERIAL PRIMARY KEY,
  site_name TEXT NOT NULL UNIQUE,
  cluster_id BIGINT NOT NULL REFERENCES frappe_clusters(id) ON DELETE RESTRICT,
  version TEXT NOT NULL,
  provisioned_instance_id BIGINT,
  owner_user_id BIGINT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frappe_sites_cluster_id ON frappe_sites (cluster_id);
CREATE INDEX IF NOT EXISTS idx_frappe_sites_owner_user_id ON frappe_sites (owner_user_id);

CREATE TABLE IF NOT EXISTS grengo_api_keys (
  id BIGSERIAL PRIMARY KEY,
  key_prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  site_scope TEXT[] NOT NULL DEFAULT '{}',
  threshold_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (threshold_per_minute > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_grengo_api_keys_user_id ON grengo_api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_grengo_api_keys_active ON grengo_api_keys (key_prefix) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS grengo_api_key_permissions (
  api_key_id BIGINT NOT NULL REFERENCES grengo_api_keys(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_write BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (api_key_id, module)
);
