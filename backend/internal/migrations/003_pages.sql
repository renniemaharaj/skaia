-- Custom pages table: each row is a routable page with block-builder content.
CREATE TABLE IF NOT EXISTS pages (
    id          BIGSERIAL    PRIMARY KEY,
    slug        VARCHAR(120) NOT NULL UNIQUE,
    title       VARCHAR(255) NOT NULL DEFAULT '',
    description TEXT         NOT NULL DEFAULT '',
    is_index    BOOLEAN      NOT NULL DEFAULT FALSE,
    content     JSONB        NOT NULL DEFAULT '[]',
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Ensure at most one page can be the index (homepage).
CREATE UNIQUE INDEX IF NOT EXISTS pages_is_index_unique
    ON pages (is_index) WHERE is_index = TRUE;
