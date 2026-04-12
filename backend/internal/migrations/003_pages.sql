-- Custom pages table: each row is a routable page with block-builder content.
CREATE TABLE IF NOT EXISTS pages (
    id          BIGSERIAL    PRIMARY KEY,
    slug        VARCHAR(120) NOT NULL UNIQUE,
    title       VARCHAR(255) NOT NULL DEFAULT '',
    description TEXT         NOT NULL DEFAULT '',
    is_index    BOOLEAN      NOT NULL DEFAULT FALSE,
    content     JSONB        NOT NULL DEFAULT '[]',
    owner_id    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Ensure at most one page can be the index (homepage).
CREATE UNIQUE INDEX IF NOT EXISTS pages_is_index_unique
    ON pages (is_index) WHERE is_index = TRUE;

-- For existing databases: add owner_id if missing.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pages_owner ON pages(owner_id);

-- Editors junction table: grants edit access to users on specific pages.
CREATE TABLE IF NOT EXISTS page_editors (
    id         BIGSERIAL PRIMARY KEY,
    page_id    BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (page_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_page_editors_page ON page_editors(page_id);
CREATE INDEX IF NOT EXISTS idx_page_editors_user ON page_editors(user_id);
