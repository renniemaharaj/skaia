CREATE TABLE IF NOT EXISTS ranked_datasets (
 id BIGSERIAL PRIMARY KEY,
 key VARCHAR(64) NOT NULL UNIQUE CHECK(key ~ '^[a-z][a-z0-9_-]{1,63}$'),
 name VARCHAR(100) NOT NULL,
 description VARCHAR(500) NOT NULL DEFAULT '',
 metric_label VARCHAR(60) NOT NULL,
 direction VARCHAR(8) NOT NULL CHECK(direction IN ('asc','desc')),
 tie_rule VARCHAR(16) NOT NULL CHECK(tie_rule IN ('competition','dense','ordinal')),
 visibility VARCHAR(16) NOT NULL CHECK(visibility IN ('public','members','private')),
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ranked_seasons (
 id BIGSERIAL PRIMARY KEY,
 dataset_id BIGINT NOT NULL REFERENCES ranked_datasets(id) ON DELETE RESTRICT,
 key VARCHAR(64) NOT NULL,
 name VARCHAR(100) NOT NULL,
 starts_at TIMESTAMPTZ NOT NULL,
 ends_at TIMESTAMPTZ,
 closed_at TIMESTAMPTZ,
 created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(dataset_id,key), CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS ranked_entries (
 id BIGSERIAL PRIMARY KEY,
 dataset_id BIGINT NOT NULL REFERENCES ranked_datasets(id) ON DELETE RESTRICT,
 season_id BIGINT NOT NULL REFERENCES ranked_seasons(id) ON DELETE RESTRICT,
 subject_type VARCHAR(16) NOT NULL CHECK(subject_type IN ('user','external','team')),
 subject_key VARCHAR(255) NOT NULL,
 display_name VARCHAR(120) NOT NULL,
 public BOOLEAN NOT NULL DEFAULT TRUE,
 score NUMERIC(20,4) NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(season_id,subject_type,subject_key)
);
CREATE INDEX IF NOT EXISTS idx_ranked_entries_desc ON ranked_entries(season_id,score DESC,id);
CREATE INDEX IF NOT EXISTS idx_ranked_entries_asc ON ranked_entries(season_id,score ASC,id);
CREATE TABLE IF NOT EXISTS ranked_ingestions (
 id BIGSERIAL PRIMARY KEY,
 dataset_id BIGINT NOT NULL REFERENCES ranked_datasets(id) ON DELETE RESTRICT,
 season_id BIGINT NOT NULL REFERENCES ranked_seasons(id) ON DELETE RESTRICT,
 producer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 event_hash BYTEA NOT NULL CHECK(octet_length(event_hash)=32),
 payload_hash BYTEA NOT NULL CHECK(octet_length(payload_hash)=32),
 entry_id BIGINT NOT NULL REFERENCES ranked_entries(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(dataset_id,event_hash)
);
DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON ranked_ingestions;
CREATE TRIGGER skaia_reject_hard_delete BEFORE DELETE ON ranked_ingestions FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete();

INSERT INTO permissions(name,category,description) VALUES
 ('rankings.manage','rankings','Manage ranked datasets and seasons'),
 ('rankings.produce','rankings','Submit idempotent ranked dataset updates')
ON CONFLICT(name) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r,permissions p WHERE r.name IN ('admin','superuser') AND p.name IN ('rankings.manage','rankings.produce')
ON CONFLICT DO NOTHING;
