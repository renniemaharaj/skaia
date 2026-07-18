-- Operational controls for the normalized page-section read cutover. The
-- telemetry is deliberately content-free; pages.content remains the rollback
-- projection until the release-window retirement preflight succeeds.

ALTER TABLE page_section_shadow_runs
    ADD COLUMN IF NOT EXISTS consecutive_matched_runs BIGINT NOT NULL DEFAULT 0
        CHECK (consecutive_matched_runs >= 0),
    ADD COLUMN IF NOT EXISTS matched_since TIMESTAMP,
    ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (rollback_status IN ('pending', 'matched', 'mismatch')),
    ADD COLUMN IF NOT EXISTS rollback_drilled_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cutover_ready_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS legacy_write_count BIGINT NOT NULL DEFAULT 0
        CHECK (legacy_write_count >= 0),
    ADD COLUMN IF NOT EXISTS last_legacy_write_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_page_section_shadow_runs_cutover
    ON page_section_shadow_runs(status, rollback_status, matched_since);
