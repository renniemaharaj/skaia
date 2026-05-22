-- 009_auth_user_separation.sql
-- Skaia: Decouple authentication from user model

-- 1. Migrate data from users to new tables
INSERT INTO auth_credentials (user_id, password_hash, created_at, updated_at)
SELECT id, password_hash, created_at, updated_at FROM users WHERE password_hash IS NOT NULL;

INSERT INTO auth_totp_secrets (user_id, totp_secret, enabled, created_at, updated_at)
SELECT id, totp_secret, totp_enabled, created_at, updated_at FROM users WHERE totp_secret IS NOT NULL OR totp_enabled IS TRUE;

-- 3. Remove sensitive fields from users table
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled;
