-- Provider-neutral, non-financial external-event rewards.
CREATE TABLE IF NOT EXISTS reward_event_providers (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(64) NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    name VARCHAR(80) NOT NULL,
    adapter_key VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_rules (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES reward_event_providers(id) ON DELETE RESTRICT,
    event_type VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    points BIGINT NOT NULL CHECK (points > 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, event_type, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_rules_active
    ON reward_rules(provider_id, event_type) WHERE enabled;

CREATE TABLE IF NOT EXISTS reward_provider_events (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES reward_event_providers(id) ON DELETE RESTRICT,
    provider_event_hash BYTEA NOT NULL CHECK (octet_length(provider_event_hash)=32),
    payload_hash BYTEA NOT NULL CHECK (octet_length(payload_hash)=32),
    event_type VARCHAR(64) NOT NULL,
    subject_hash BYTEA NOT NULL CHECK (octet_length(subject_hash)=32),
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, provider_event_hash)
);

CREATE TABLE IF NOT EXISTS reward_grants (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL UNIQUE REFERENCES reward_provider_events(id) ON DELETE RESTRICT,
    rule_id BIGINT NOT NULL REFERENCES reward_rules(id) ON DELETE RESTRICT,
    rule_version INTEGER NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    points BIGINT NOT NULL CHECK (points > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_catalog (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(64) NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    cost BIGINT NOT NULL CHECK (cost > 0),
    delivery_adapter VARCHAR(64) NOT NULL,
    delivery_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reward_id BIGINT NOT NULL REFERENCES reward_catalog(id) ON DELETE RESTRICT,
    idempotency_hash BYTEA NOT NULL CHECK (octet_length(idempotency_hash)=32),
    request_hash BYTEA NOT NULL CHECK (octet_length(request_hash)=32),
    cost BIGINT NOT NULL CHECK (cost > 0),
    status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivering','succeeded','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, idempotency_hash)
);

CREATE TABLE IF NOT EXISTS reward_ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    grant_id BIGINT UNIQUE REFERENCES reward_grants(id) ON DELETE RESTRICT,
    redemption_id BIGINT UNIQUE REFERENCES reward_redemptions(id) ON DELETE RESTRICT,
    delta BIGINT NOT NULL CHECK (delta <> 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((grant_id IS NOT NULL)::int + (redemption_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_user ON reward_ledger_entries(user_id,id);

CREATE TABLE IF NOT EXISTS reward_fulfilments (
    id BIGSERIAL PRIMARY KEY,
    redemption_id BIGINT NOT NULL UNIQUE REFERENCES reward_redemptions(id) ON DELETE RESTRICT,
    adapter_key VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    payload_hash BYTEA NOT NULL CHECK (octet_length(payload_hash)=32),
    status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','succeeded','failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_owner VARCHAR(120),
    lease_expires_at TIMESTAMPTZ,
    last_error VARCHAR(500),
    delivered_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reward_fulfilments_claim
    ON reward_fulfilments(available_at,id) WHERE status IN ('pending','leased') AND attempts < 8;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['reward_provider_events','reward_grants','reward_ledger_entries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON %I', table_name);
    EXECUTE format('CREATE TRIGGER skaia_reject_hard_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete()', table_name);
  END LOOP;
END $$;
