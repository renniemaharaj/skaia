-- 018_inbox_group_conversations.sql

BEGIN;

CREATE TABLE IF NOT EXISTS inbox_conversation_participants (
    conversation_id BIGINT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id BIGINT DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
);

-- Migrate existing 1-on-1 participants
INSERT INTO inbox_conversation_participants (conversation_id, user_id)
SELECT id, user1_id FROM inbox_conversations;

INSERT INTO inbox_conversation_participants (conversation_id, user_id)
SELECT id, user2_id FROM inbox_conversations;

-- Remove unique constraint if it exists
ALTER TABLE inbox_conversations DROP CONSTRAINT IF EXISTS inbox_conversations_user1_id_user2_id_key;

-- Add new columns
ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- We cannot drop user1_id and user2_id yet without breaking current code that might still be deploying, 
-- but since this is a dev environment migration, we can drop them directly.
ALTER TABLE inbox_conversations DROP COLUMN user1_id;
ALTER TABLE inbox_conversations DROP COLUMN user2_id;

COMMIT;
