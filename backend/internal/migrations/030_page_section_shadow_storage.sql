-- Migration 030: normalized custom-page section storage in shadow mode.
-- pages.content remains authoritative until the typed API cutover.

CREATE TABLE IF NOT EXISTS page_themes (
    page_id       BIGINT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    schema_version INT NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    revision      BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_theme_tokens (
    id            BIGSERIAL PRIMARY KEY,
    page_id       BIGINT NOT NULL REFERENCES page_themes(page_id) ON DELETE CASCADE,
    token_key     VARCHAR(64) NOT NULL CHECK (token_key ~ '^[a-z][a-z0-9_-]*$'),
    label         VARCHAR(120) NOT NULL,
    color_value   VARCHAR(128) NOT NULL CHECK (length(btrim(color_value)) > 0),
    display_order INT NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 63),
    revision      BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (page_id, token_key),
    UNIQUE (page_id, display_order)
);

CREATE TABLE IF NOT EXISTS page_section_instances (
    id                  BIGSERIAL PRIMARY KEY,
    page_id             BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    source_index        INT NOT NULL CHECK (source_index >= 0),
    legacy_key_kind     VARCHAR(8) NOT NULL CHECK (legacy_key_kind IN ('number', 'string')),
    legacy_key          TEXT NOT NULL CHECK (length(legacy_key) > 0),
    original_section_type VARCHAR(80) NOT NULL,
    section_type        VARCHAR(80) NOT NULL CHECK (section_type IN ('hero','card_group','stat_cards','social_links','image_gallery','feature_grid','cta','event_highlights','profile_card','rich_text','code_editor','data_sources','derived_section','custom_section','form','qa','survey','poll','vote')),
    display_order       INT NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    heading             TEXT NOT NULL DEFAULT '',
    subheading          TEXT NOT NULL DEFAULT '',
    shell_version       INT NOT NULL DEFAULT 1 CHECK (shell_version = 1),
    layout              VARCHAR(16) NOT NULL DEFAULT 'center' CHECK (layout IN ('left', 'center', 'right', 'wide')),
    container_width     VARCHAR(16) NOT NULL DEFAULT 'content' CHECK (container_width IN ('narrow', 'content', 'wide', 'full')),
    margin_top          DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_top BETWEEN -512 AND 512),
    margin_right        DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_right BETWEEN -512 AND 512),
    margin_bottom       DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_bottom BETWEEN -512 AND 512),
    margin_left         DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_left BETWEEN -512 AND 512),
    padding_top         DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_top BETWEEN 0 AND 512),
    padding_right       DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_right BETWEEN 0 AND 512),
    padding_bottom      DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_bottom BETWEEN 0 AND 512),
    padding_left        DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_left BETWEEN 0 AND 512),
    animation           VARCHAR(24) NOT NULL DEFAULT 'none' CHECK (animation IN ('none', 'fade-in', 'slide-up', 'slide-left', 'slide-right', 'zoom-in', 'bounce')),
    animation_intensity VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (animation_intensity IN ('subtle', 'normal', 'dramatic')),
    background_color    JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    text_color          JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    h1_color            JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    h2_color            JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    h3_color            JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    content_scale       DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (content_scale BETWEEN 0.5 AND 2),
    collapsible         BOOLEAN NOT NULL DEFAULT FALSE,
    default_collapsed   BOOLEAN NOT NULL DEFAULT FALSE,
    config_version      INT NOT NULL DEFAULT 1 CHECK (config_version >= 1),
    config              JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
    config_encoding     VARCHAR(8) NOT NULL DEFAULT 'string' CHECK (config_encoding IN ('string', 'object')),
    quarantined_config  JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quarantined_config) = 'object'),
    quarantined_section JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quarantined_section) = 'object'),
    alias_repairs       JSONB NOT NULL DEFAULT '[]',
    revision            BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (page_id, source_index),
    UNIQUE (page_id, legacy_key_kind, legacy_key),
    UNIQUE (id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_page_section_instances_page_order
    ON page_section_instances(page_id, display_order, source_index);
CREATE INDEX IF NOT EXISTS idx_page_section_instances_type
    ON page_section_instances(section_type);

CREATE TABLE IF NOT EXISTS page_section_color_references (
    section_id BIGINT NOT NULL,
    page_id     BIGINT NOT NULL,
    color_role  VARCHAR(16) NOT NULL CHECK (color_role IN ('background', 'text', 'h1', 'h2', 'h3')),
    token_key   VARCHAR(64) NOT NULL,
    PRIMARY KEY (section_id, color_role),
    FOREIGN KEY (section_id, page_id) REFERENCES page_section_instances(id, page_id) ON DELETE CASCADE,
    FOREIGN KEY (page_id, token_key) REFERENCES page_theme_tokens(page_id, token_key) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_page_section_color_refs_token
    ON page_section_color_references(page_id, token_key);

CREATE TABLE IF NOT EXISTS page_section_instance_items (
    id                 BIGSERIAL PRIMARY KEY,
    section_id         BIGINT NOT NULL REFERENCES page_section_instances(id) ON DELETE CASCADE,
    source_index       INT NOT NULL CHECK (source_index >= 0),
    legacy_key_kind    VARCHAR(8) NOT NULL CHECK (legacy_key_kind IN ('number', 'string')),
    legacy_key         TEXT NOT NULL CHECK (length(legacy_key) > 0),
    display_order      INT NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    icon               VARCHAR(120) NOT NULL DEFAULT '',
    heading            TEXT NOT NULL DEFAULT '',
    subheading         TEXT NOT NULL DEFAULT '',
    image_url          TEXT NOT NULL DEFAULT '',
    link_url           TEXT NOT NULL DEFAULT '',
    config_version     INT NOT NULL DEFAULT 1 CHECK (config_version = 1),
    config             JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
    config_encoding    VARCHAR(8) NOT NULL DEFAULT 'string' CHECK (config_encoding IN ('string', 'object')),
    quarantined_item   JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quarantined_item) = 'object'),
    revision           BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (section_id, source_index),
    UNIQUE (section_id, legacy_key_kind, legacy_key)
);
CREATE INDEX IF NOT EXISTS idx_page_section_instance_items_order
    ON page_section_instance_items(section_id, display_order, source_index);

CREATE TABLE IF NOT EXISTS page_section_presets (
    id             BIGSERIAL PRIMARY KEY,
    owner_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    source_page_id BIGINT REFERENCES pages(id) ON DELETE SET NULL,
    legacy_key     TEXT,
    name           VARCHAR(160) NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    section_type   VARCHAR(80) NOT NULL CHECK (section_type IN ('hero','card_group','stat_cards','social_links','image_gallery','feature_grid','cta','event_highlights','profile_card','rich_text','code_editor','data_sources','derived_section','custom_section','form','qa','survey','poll','vote')),
    shell_version  INT NOT NULL DEFAULT 1 CHECK (shell_version = 1),
    shell          JSONB NOT NULL CHECK (jsonb_typeof(shell) = 'object'),
    config_version INT NOT NULL DEFAULT 1 CHECK (config_version >= 1),
    config         JSONB NOT NULL CHECK (jsonb_typeof(config) = 'object'),
    items          JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
    revision       BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_section_presets_owner_legacy
    ON page_section_presets(owner_id, legacy_key) WHERE legacy_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_section_presets_owner
    ON page_section_presets(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS page_section_responses (
    id                   BIGSERIAL PRIMARY KEY,
    section_id           BIGINT NOT NULL REFERENCES page_section_instances(id) ON DELETE CASCADE,
    response_key         VARCHAR(160) NOT NULL,
    respondent_user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key_hash BYTEA,
    answers              JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
    status               VARCHAR(24) NOT NULL DEFAULT 'submitted',
    revision             BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (section_id, response_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_section_responses_idempotency
    ON page_section_responses(section_id, respondent_user_id, idempotency_key_hash)
    WHERE idempotency_key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_section_responses_section_created
    ON page_section_responses(section_id, created_at DESC);

CREATE TABLE IF NOT EXISTS page_section_quarantine (
    id              BIGSERIAL PRIMARY KEY,
    page_id         BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    source_index    INT NOT NULL CHECK (source_index >= 0),
    legacy_key_kind VARCHAR(8),
    legacy_key      TEXT,
    reason_code     VARCHAR(80) NOT NULL,
    safe_payload    JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_section_quarantine_page
    ON page_section_quarantine(page_id, source_index);

CREATE TABLE IF NOT EXISTS page_section_shadow_runs (
    page_id             BIGINT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    source_hash         VARCHAR(64) NOT NULL,
    projection_hash     VARCHAR(64) NOT NULL,
    status              VARCHAR(24) NOT NULL CHECK (status IN ('matched', 'quarantined', 'mismatch')),
    section_count       INT NOT NULL DEFAULT 0 CHECK (section_count >= 0),
    item_count          INT NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    quarantine_count    INT NOT NULL DEFAULT 0 CHECK (quarantine_count >= 0),
    alias_repairs       JSONB NOT NULL DEFAULT '[]',
    default_repairs     JSONB NOT NULL DEFAULT '[]',
    mismatch_codes      JSONB NOT NULL DEFAULT '[]',
    last_source_updated TIMESTAMP,
    run_count           BIGINT NOT NULL DEFAULT 1 CHECK (run_count >= 1),
    last_run_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_section_shadow_runs_status
    ON page_section_shadow_runs(status, last_run_at);
