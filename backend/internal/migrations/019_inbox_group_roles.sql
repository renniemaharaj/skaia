-- 019_inbox_group_roles.sql

BEGIN;

-- Add role and mute status to participants
ALTER TABLE inbox_conversation_participants ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';
ALTER TABLE inbox_conversation_participants ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE;

-- Add lock status to conversations
ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
