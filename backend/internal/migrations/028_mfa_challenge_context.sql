-- Persist machine-readable MFA challenge context so clients can explain why
-- verification is required without inferring security state from a route.

ALTER TABLE mfa_challenge_required
    ADD COLUMN IF NOT EXISTS reason_code TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT '';
