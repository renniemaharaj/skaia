CREATE TABLE IF NOT EXISTS community_publications (
 id BIGSERIAL PRIMARY KEY,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('proposal','showcase','event')),
 slug VARCHAR(100) NOT NULL,
 title VARCHAR(160) NOT NULL,
 summary VARCHAR(500) NOT NULL DEFAULT '',
 body TEXT NOT NULL DEFAULT '',
 visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','members','private')),
 publication_status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(publication_status IN ('draft','published','archived')),
 author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 canonical_thread_id BIGINT REFERENCES forum_threads(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(kind,slug)
);
CREATE INDEX IF NOT EXISTS idx_community_publications_directory ON community_publications(kind,id DESC) WHERE deleted_at IS NULL AND publication_status='published';
CREATE TABLE IF NOT EXISTS community_proposals (
 publication_id BIGINT PRIMARY KEY REFERENCES community_publications(id) ON DELETE RESTRICT,
 state VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','under_review','accepted','rejected','completed')),
 decision TEXT NOT NULL DEFAULT '', decided_by BIGINT REFERENCES users(id) ON DELETE RESTRICT, decided_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS community_proposal_votes (
 proposal_id BIGINT NOT NULL REFERENCES community_proposals(publication_id) ON DELETE RESTRICT,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 value SMALLINT NOT NULL CHECK(value IN (-1,1)), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(proposal_id,user_id)
);
CREATE TABLE IF NOT EXISTS community_showcases (
 publication_id BIGINT PRIMARY KEY REFERENCES community_publications(id) ON DELETE RESTRICT,
 media JSONB NOT NULL DEFAULT '[]'::jsonb, credits VARCHAR(500) NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS community_events (
 publication_id BIGINT PRIMARY KEY REFERENCES community_publications(id) ON DELETE RESTRICT,
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ, location VARCHAR(200) NOT NULL DEFAULT '', capacity INTEGER CHECK(capacity IS NULL OR capacity>0),
 CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS community_event_attendance (
 event_id BIGINT NOT NULL REFERENCES community_events(publication_id) ON DELETE RESTRICT,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status VARCHAR(12) NOT NULL CHECK(status IN ('going','interested')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS community_workflow_events (
 id BIGSERIAL PRIMARY KEY, publication_id BIGINT NOT NULL REFERENCES community_publications(id) ON DELETE RESTRICT,
 actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, action VARCHAR(32) NOT NULL, before_state VARCHAR(24), after_state VARCHAR(24), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_workflow_events_publication ON community_workflow_events(publication_id,id DESC);
DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON community_workflow_events;
CREATE TRIGGER skaia_reject_hard_delete BEFORE DELETE ON community_workflow_events FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete();

INSERT INTO permissions(name,category,description) VALUES
 ('community.manage','community','Moderate community publications, proposal decisions, and events')
ON CONFLICT(name) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r,permissions p WHERE r.name IN ('admin','superuser') AND p.name='community.manage'
ON CONFLICT DO NOTHING;
