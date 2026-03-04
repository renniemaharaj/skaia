CREATE TABLE IF NOT EXISTS thread_comments (
    id         BIGSERIAL PRIMARY KEY,
    thread_id  BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    content    TEXT   NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thread_comments_thread_id ON thread_comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_comments_user_id   ON thread_comments(user_id);

CREATE TABLE IF NOT EXISTS thread_comment_likes (
    id                BIGSERIAL PRIMARY KEY,
    thread_comment_id BIGINT NOT NULL REFERENCES thread_comments(id) ON DELETE CASCADE,
    user_id           BIGINT NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(thread_comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_comment_likes_comment_id ON thread_comment_likes(thread_comment_id);
CREATE INDEX IF NOT EXISTS idx_thread_comment_likes_user_id    ON thread_comment_likes(user_id);
