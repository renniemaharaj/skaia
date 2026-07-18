-- Complete the normalized interactive-response shape and track page-scoped
-- migration parity without placing answers or identities in telemetry.

ALTER TABLE page_section_responses
    ADD COLUMN IF NOT EXISTS respondent_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS moderator_answer TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS respondent_user_key BIGINT NOT NULL DEFAULT 0
        CHECK (respondent_user_key >= 0);

UPDATE page_section_responses
SET respondent_user_key = respondent_user_id
WHERE respondent_user_key = 0 AND respondent_user_id IS NOT NULL;

DROP INDEX IF EXISTS idx_page_section_responses_idempotency;
CREATE UNIQUE INDEX idx_page_section_responses_idempotency
    ON page_section_responses(section_id, respondent_user_key, idempotency_key_hash)
    WHERE idempotency_key_hash IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'page_section_responses_status_check'
    ) THEN
        ALTER TABLE page_section_responses
            ADD CONSTRAINT page_section_responses_status_check
            CHECK (status IN ('submitted', 'pending', 'published', 'answered', 'archived'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS page_section_response_migrations (
    page_id              BIGINT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    source_hash          VARCHAR(64) NOT NULL,
    normalized_hash      VARCHAR(64) NOT NULL,
    status               VARCHAR(24) NOT NULL CHECK (status IN ('matched', 'mismatch')),
    response_count       INT NOT NULL DEFAULT 0 CHECK (response_count >= 0),
    interactive_sections INT NOT NULL DEFAULT 0 CHECK (interactive_sections >= 0),
    mismatch_codes       JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(mismatch_codes) = 'array'),
    run_count            BIGINT NOT NULL DEFAULT 1 CHECK (run_count >= 1),
    last_run_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_page_section_response_migrations_status
    ON page_section_response_migrations(status, last_run_at);
