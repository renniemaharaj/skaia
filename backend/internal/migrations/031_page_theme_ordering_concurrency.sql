-- Migration 031: allow transactional page-palette reordering without a
-- temporary uniqueness violation. The value range remains constrained to 0-63.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'page_theme_tokens_page_id_display_order_key'
          AND conrelid = 'page_theme_tokens'::regclass
          AND NOT condeferrable
    ) THEN
        ALTER TABLE page_theme_tokens
            DROP CONSTRAINT page_theme_tokens_page_id_display_order_key;
        ALTER TABLE page_theme_tokens
            ADD CONSTRAINT page_theme_tokens_page_id_display_order_key
            UNIQUE (page_id, display_order) DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END $$;
