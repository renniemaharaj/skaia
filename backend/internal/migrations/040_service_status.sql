CREATE TABLE IF NOT EXISTS service_incidents (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL CHECK (char_length(trim(title)) >= 3),
    summary VARCHAR(1000) NOT NULL DEFAULT '',
    state VARCHAR(24) NOT NULL CHECK (state IN ('draft', 'investigating', 'monitoring', 'resolved', 'maintenance')),
    severity VARCHAR(24) NOT NULL CHECK (severity IN ('minor', 'major', 'critical', 'maintenance')),
    component VARCHAR(40) NOT NULL CHECK (component IN ('database', 'cache', 'web', 'platform')),
    started_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((state = 'resolved' AND resolved_at IS NOT NULL) OR (state <> 'resolved' AND resolved_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_service_incidents_public
    ON service_incidents (started_at DESC, id DESC)
    WHERE state <> 'draft';

CREATE TABLE IF NOT EXISTS service_incident_events (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES service_incidents(id) ON DELETE RESTRICT,
    actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(24) NOT NULL CHECK (action IN ('create', 'update')),
    before_state JSONB,
    after_state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_incident_events_incident
    ON service_incident_events (incident_id, created_at DESC, id DESC);

-- Incident history is operational evidence and cannot be removed by the
-- application role. The existing hard-delete operator remains the only reviewed
-- bypass for lifecycle evidence.
DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON service_incident_events;
CREATE TRIGGER skaia_reject_hard_delete
    BEFORE DELETE ON service_incident_events
    FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete();
