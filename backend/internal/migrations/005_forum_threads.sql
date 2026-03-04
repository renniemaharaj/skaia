CREATE TABLE IF NOT EXISTS forum_threads (
    id          BIGSERIAL    PRIMARY KEY,
    category_id BIGINT       NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
    user_id     BIGINT       NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    content     TEXT         NOT NULL,
    view_count  INT     DEFAULT 0,
    reply_count INT     DEFAULT 0,
    is_pinned   BOOLEAN DEFAULT false,
    is_locked   BOOLEAN DEFAULT false,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_category_id ON forum_threads(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_user_id     ON forum_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_created_at  ON forum_threads(created_at DESC);
