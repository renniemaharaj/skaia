-- 006_resource_views.sql
-- Unified resource view tracking for pages and threads.

CREATE TABLE IF NOT EXISTS resource_views (
    id          BIGSERIAL    PRIMARY KEY,
    resource    VARCHAR(20)  NOT NULL,
    resource_id BIGINT       NOT NULL,
    user_id     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    ip          VARCHAR(45),
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resource_views_resource
    ON resource_views(resource, resource_id, created_at);

CREATE INDEX IF NOT EXISTS idx_resource_views_user
    ON resource_views(user_id) WHERE user_id IS NOT NULL;
