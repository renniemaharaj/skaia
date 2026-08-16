-- Additive lifecycle foundation for application-owned records.
-- Runtime hard-delete guards are installed only after every repository has
-- moved to these lifecycle columns.
DO $$
DECLARE
    table_name TEXT;
    constraint_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users', 'roles', 'permissions', 'site_config',
        'forum_categories', 'forum_threads', 'thread_comments',
        'store_categories', 'products', 'orders', 'subscription_plans',
        'subscriptions', 'user_cards', 'product_reviews',
        'store_reference_codes', 'inbox_conversations', 'inbox_messages',
        'notifications', 'pages', 'page_comments', 'data_sources',
        'custom_sections', 'user_page_allocations', 'page_sections',
        'page_items', 'app_blueprints',
        'provisioned_instances', 'media_history'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
            table_name
        );
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_by BIGINT',
            table_name
        );

        constraint_name := table_name || '_deleted_by_fkey';
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = constraint_name
              AND conrelid = table_name::regclass
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL',
                table_name,
                constraint_name
            );
        END IF;

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON %I (deleted_at) WHERE deleted_at IS NOT NULL',
            'idx_' || table_name || '_deleted_at',
            table_name
        );
    END LOOP;

    FOREACH table_name IN ARRAY ARRAY[
        'role_permissions', 'user_roles', 'user_permissions',
        'superuser_demotion_votes', 'cart_items', 'thread_likes',
        'thread_comment_likes', 'thread_editors',
        'inbox_conversation_participants', 'user_blocks', 'page_editors',
        'page_likes', 'page_comment_likes'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMPTZ',
            table_name
        );
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS inactive_by BIGINT',
            table_name
        );

        constraint_name := table_name || '_inactive_by_fkey';
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = constraint_name
              AND conrelid = table_name::regclass
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (inactive_by) REFERENCES users(id) ON DELETE SET NULL',
                table_name,
                constraint_name
            );
        END IF;
    END LOOP;
END
$$;

CREATE TABLE IF NOT EXISTS resource_lifecycle_events (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id TEXT NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('delete', 'restore')),
    outcome VARCHAR(20) NOT NULL DEFAULT 'succeeded',
    reason_code VARCHAR(80),
    bulk_correlation_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_lifecycle_events_resource
    ON resource_lifecycle_events(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_lifecycle_events_actor
    ON resource_lifecycle_events(actor_id, created_at DESC);

-- Authentication lifecycle records retain only non-secret revocation evidence.
ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(80);
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(80);
ALTER TABLE email_verification_tokens
    ALTER COLUMN token DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE password_reset_tokens
    ALTER COLUMN token DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE auth_credentials
    ALTER COLUMN password_hash DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE auth_totp_secrets
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE auth_backup_codes
    ALTER COLUMN code_hash DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE mfa_challenge_required
    ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sessions_active
    ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
    ON user_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

-- Application roles may never physically remove lifecycle or evidence rows.
-- Operators must be granted the dedicated NOLOGIN role explicitly.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skaia_hard_delete_operator') THEN
        CREATE ROLE skaia_hard_delete_operator NOLOGIN;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION reject_skaia_hard_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT pg_has_role(session_user, 'skaia_hard_delete_operator', 'SET') THEN
        RAISE EXCEPTION 'hard delete rejected for %', TG_TABLE_NAME
            USING ERRCODE='42501', HINT='Use the domain lifecycle operation.';
    END IF;
    RETURN OLD;
END
$$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users','roles','permissions','site_config','forum_categories','forum_threads','thread_comments',
        'store_categories','products','orders','subscription_plans','subscriptions','user_cards',
        'product_reviews','store_reference_codes','inbox_conversations','inbox_messages','notifications',
        'pages','page_comments','data_sources','custom_sections','user_page_allocations','page_sections',
        'page_items','app_blueprints','provisioned_instances','media_history',
        'role_permissions','user_roles','user_permissions','superuser_demotion_votes','cart_items',
        'thread_likes','thread_comment_likes','thread_editors','inbox_conversation_participants','user_blocks',
        'page_editors','page_likes','page_comment_likes',
        'user_sessions','sessions','email_verification_tokens','password_reset_tokens','auth_backup_codes',
        'auth_credentials','auth_totp_secrets','mfa_challenge_required','payments','order_items',
        'user_wallet_transactions','store_reference_code_payouts','events','resource_views',
        'resource_lifecycle_events'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON %I', table_name);
        EXECUTE format(
            'CREATE TRIGGER skaia_reject_hard_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete()',
            table_name
        );
    END LOOP;
END
$$;
