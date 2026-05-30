-- Migration 012: Stateful session layer for IP-aware validation
-- with step-up authentication via Cloudflare Turnstile.

CREATE TABLE IF NOT EXISTS sessions (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_ip      VARCHAR(45)  NOT NULL,
    last_seen_ip    VARCHAR(45)  NOT NULL,
    user_agent_hash VARCHAR(64)  NOT NULL DEFAULT '',
    issued_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP    NOT NULL,
    verified        BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
