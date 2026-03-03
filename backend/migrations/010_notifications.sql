-- User notifications
CREATE TABLE IF NOT EXISTS notifications (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(64)   NOT NULL,
    message    TEXT          NOT NULL,
    route      VARCHAR(512)  NOT NULL DEFAULT '',
    is_read    BOOLEAN       DEFAULT FALSE,
    created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
