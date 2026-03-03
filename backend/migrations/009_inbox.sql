-- Inbox: private conversations between two users
CREATE TABLE IF NOT EXISTS inbox_conversations (
    id         BIGSERIAL PRIMARY KEY,
    user1_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_conversations_user1 ON inbox_conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_user2 ON inbox_conversations(user2_id);

-- Individual messages within a conversation
CREATE TABLE IF NOT EXISTS inbox_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
    sender_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT   NOT NULL,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation ON inbox_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sender       ON inbox_messages(sender_id);
