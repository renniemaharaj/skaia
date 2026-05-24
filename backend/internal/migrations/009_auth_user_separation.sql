-- 009_auth_user_separation.sql
-- Skaia: Decouple authentication from user model

-- This migration is intentionally legacy-safe: fresh schemas already create
-- auth tables in 001_schema.sql and no longer have auth columns on users.

-- 1. Migrate password hashes from legacy users.password_hash when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    INSERT INTO auth_credentials (user_id, password_hash, created_at, updated_at)
    SELECT id, password_hash, created_at, updated_at
    FROM users
    WHERE password_hash IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

-- 2. Migrate TOTP secrets from legacy users columns when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'totp_secret'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'totp_enabled'
    ) THEN
      INSERT INTO auth_totp_secrets (user_id, totp_secret, enabled, created_at, updated_at)
      SELECT id, totp_secret, COALESCE(totp_enabled, false), created_at, updated_at
      FROM users
      WHERE totp_secret IS NOT NULL OR COALESCE(totp_enabled, false) IS TRUE
      ON CONFLICT (user_id) DO UPDATE
        SET totp_secret = EXCLUDED.totp_secret,
            enabled = EXCLUDED.enabled,
            updated_at = EXCLUDED.updated_at;
    ELSE
      INSERT INTO auth_totp_secrets (user_id, totp_secret, enabled, created_at, updated_at)
      SELECT id, totp_secret, false, created_at, updated_at
      FROM users
      WHERE totp_secret IS NOT NULL
      ON CONFLICT (user_id) DO UPDATE
        SET totp_secret = EXCLUDED.totp_secret,
            updated_at = EXCLUDED.updated_at;
    END IF;
  END IF;
END $$;

-- There was no legacy users backup-code column in Skaia; backup codes are
-- generated into auth_backup_codes after TOTP is enabled.

-- 3. Remove sensitive fields from legacy users table.
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled;
