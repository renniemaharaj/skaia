CREATE TABLE IF NOT EXISTS external_identity_providers (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(64) NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    name VARCHAR(80) NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
    adapter_key VARCHAR(64) NOT NULL CHECK (adapter_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    public_display_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_external_identity_providers_active
    ON external_identity_providers (name, id) WHERE deleted_at IS NULL AND enabled;

CREATE TABLE IF NOT EXISTS external_identity_challenges (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES external_identity_providers(id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    session_hash BYTEA NOT NULL CHECK (octet_length(session_hash) = 32),
    subject VARCHAR(255) NOT NULL CHECK (char_length(trim(subject)) BETWEEN 1 AND 255),
    display_name VARCHAR(120) NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 120),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_identity_challenges_owner
    ON external_identity_challenges (user_id, provider_id, session_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS external_identity_links (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES external_identity_providers(id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subject VARCHAR(255) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    public BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ NOT NULL,
    reverified_at TIMESTAMPTZ,
    unlinked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_identity_links_user_provider_active
    ON external_identity_links (user_id, provider_id) WHERE unlinked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_identity_links_provider_subject_active
    ON external_identity_links (provider_id, subject) WHERE unlinked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_external_identity_links_public_user
    ON external_identity_links (user_id, provider_id, id) WHERE unlinked_at IS NULL AND public;

CREATE TABLE IF NOT EXISTS external_identity_events (
    id BIGSERIAL PRIMARY KEY,
    link_id BIGINT REFERENCES external_identity_links(id) ON DELETE RESTRICT,
    provider_id BIGINT NOT NULL REFERENCES external_identity_providers(id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(24) NOT NULL CHECK (action IN ('linked', 'reverified', 'visibility_changed', 'unlinked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_identity_events_user
    ON external_identity_events (user_id, created_at DESC, id DESC);

DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON external_identity_events;
CREATE TRIGGER skaia_reject_hard_delete
    BEFORE DELETE ON external_identity_events
    FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete();
