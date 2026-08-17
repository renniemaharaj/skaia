-- Existing-tenant bridge for the multi-documentation hub. Fresh installs also
-- carry this schema in 001_schema.sql.
CREATE TABLE IF NOT EXISTS documentations (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(120) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility VARCHAR(20) NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'unlisted', 'private')),
    owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS documentation_sections (
    id BIGSERIAL PRIMARY KEY,
    documentation_id BIGINT NOT NULL REFERENCES documentations(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS documentation_articles (
    id BIGSERIAL PRIMARY KEY,
    documentation_id BIGINT NOT NULL REFERENCES documentations(id) ON DELETE RESTRICT,
    section_id BIGINT REFERENCES documentation_sections(id) ON DELETE RESTRICT,
    slug VARCHAR(120) NOT NULL,
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    display_order INT NOT NULL DEFAULT 0,
    author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    last_edited_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS documentations_active_slug_unique
    ON documentations (LOWER(slug)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentations_owner
    ON documentations(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentation_sections_navigation
    ON documentation_sections(documentation_id, display_order, id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documentation_articles_active_slug_unique
    ON documentation_articles(documentation_id, LOWER(slug)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentation_articles_navigation
    ON documentation_articles(documentation_id, section_id, display_order, id) WHERE deleted_at IS NULL;

INSERT INTO permissions (name, category, description) VALUES
    ('docs.create', 'docs', 'Create documentation sets'),
    ('docs.manage', 'docs', 'Manage any documentation set')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('admin', 'superuser') AND p.name IN ('docs.create', 'docs.manage')
ON CONFLICT DO NOTHING;

-- Migration 034 has already run on existing tenants, so install its retained
-- hard-delete invariant for these new tables here as well.
DO $$
DECLARE table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'documentations', 'documentation_sections', 'documentation_articles'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON %I', table_name);
        EXECUTE format(
            'CREATE TRIGGER skaia_reject_hard_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete()',
            table_name
        );
    END LOOP;
END
$$;
