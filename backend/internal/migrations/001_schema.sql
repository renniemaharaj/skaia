-- Schema for a fresh database. Prices are stored as BIGINT cents.

-- Bootstrap application role
DO $$ BEGIN
  CREATE ROLE skaia_user WITH LOGIN PASSWORD '{{PGPASSWORD}}';
EXCEPTION WHEN DUPLICATE_OBJECT THEN
  -- Rerunning schema migrations must never rotate an existing cluster role to
  -- a template value. Credential rotation is an explicit deployment action.
  NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'GRANT ALL PRIVILEGES ON DATABASE ' || quote_ident(current_database()) || ' TO skaia_user';
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO skaia_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO skaia_user;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id               BIGSERIAL PRIMARY KEY,
    username         VARCHAR(255) NOT NULL UNIQUE,
    email            VARCHAR(255) NOT NULL UNIQUE,
    -- password_hash removed, now in auth_credentials
    display_name     VARCHAR(255),
    avatar_url       TEXT,
    banner_url       TEXT,
    photo_url        TEXT,
    bio              TEXT,
    discord_id       VARCHAR(255),
    is_suspended     BOOLEAN   DEFAULT false,
    suspended_at     TIMESTAMP,
    suspended_reason TEXT,
    background_image_url TEXT,
    background_video_url TEXT,
    background_position  VARCHAR(50),
    font_family          VARCHAR(100),
    profile_card_art_url TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_video_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_position  VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS font_family          VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_card_art_url TEXT;

CREATE TABLE IF NOT EXISTS user_sessions (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_jti     VARCHAR(255) UNIQUE,
    device_info   VARCHAR(500),
    ip_address    VARCHAR(45),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id    ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_ip      VARCHAR(45)  NOT NULL,
    last_seen_ip    VARCHAR(45)  NOT NULL,
    user_agent_hash VARCHAR(64)  NOT NULL DEFAULT '',
    issued_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP    NOT NULL,
    verified        BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS roles (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    power_level INT NOT NULL DEFAULT 0,
    theme_color VARCHAR(50),
    glow_color  VARCHAR(50),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS power_level INT NOT NULL DEFAULT 0;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS theme_color VARCHAR(50);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS glow_color  VARCHAR(50);

-- Insert superuser role for fresh DBs
INSERT INTO roles (id, name, description, power_level, theme_color)
VALUES (100, 'superuser', 'Superuser with unrestricted power', 255, '#5b9e8e')
ON CONFLICT (id) DO UPDATE
    SET power_level = EXCLUDED.power_level,
        theme_color = COALESCE(NULLIF(roles.theme_color, ''), EXCLUDED.theme_color);

CREATE TABLE IF NOT EXISTS permissions (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category    VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       BIGINT REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
    role_id     BIGINT REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by BIGINT    REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT REFERENCES users(id)       ON DELETE CASCADE,
    permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by    BIGINT    REFERENCES users(id),
    UNIQUE(user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS superuser_demotion_votes (
    id          BIGSERIAL PRIMARY KEY,
    actor_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
    target_id   BIGINT REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(actor_id, target_id)
);
-- Store
CREATE TABLE IF NOT EXISTS store_categories (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL UNIQUE,
    description   TEXT,
    display_order INT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id              BIGSERIAL PRIMARY KEY,
    category_id     BIGINT    NOT NULL REFERENCES store_categories(id) ON DELETE CASCADE,
    owner_id        BIGINT    REFERENCES users(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    price           BIGINT    NOT NULL,
    image_url       TEXT,
    media           JSONB     DEFAULT '[]'::jsonb,
    stock           INT       DEFAULT 0,
    original_price  BIGINT,
    stock_unlimited BOOLEAN   DEFAULT false,
    is_active       BOOLEAN   DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_owner_id ON products(owner_id);

CREATE TABLE IF NOT EXISTS cart_items (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INT    NOT NULL DEFAULT 1,
    added_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);

CREATE TABLE IF NOT EXISTS orders (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_price BIGINT    NOT NULL,
    status      VARCHAR(50) DEFAULT 'pending',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
    id         BIGSERIAL PRIMARY KEY,
    order_id   BIGINT NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id),
    quantity   INT    NOT NULL,
    price      BIGINT NOT NULL,
    vendor_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    vendor_note TEXT,
    vendor_updated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_status VARCHAR(50) NOT NULL DEFAULT 'pending';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_note TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_updated_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_order_items_vendor_status ON order_items(vendor_status);

CREATE TABLE IF NOT EXISTS payments (
    id             BIGSERIAL    PRIMARY KEY,
    order_id       BIGINT       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id        BIGINT       NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    provider       VARCHAR(50)  NOT NULL DEFAULT 'demo',
    provider_ref   VARCHAR(255),
    amount         BIGINT       NOT NULL,
    currency       VARCHAR(10)  NOT NULL DEFAULT 'usd',
    status         VARCHAR(50)  NOT NULL DEFAULT 'pending',
    failure_reason TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id  ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON payments(status);

-- Subscription plans and subscriptions
CREATE TABLE IF NOT EXISTS subscription_plans (
    id              BIGSERIAL    PRIMARY KEY,
    name            VARCHAR(255) NOT NULL UNIQUE,
    description     TEXT,
    price_cents     BIGINT       NOT NULL,
    currency        VARCHAR(10)  NOT NULL DEFAULT 'usd',
    interval_unit   VARCHAR(20)  NOT NULL DEFAULT 'month',
    interval_count  INT          NOT NULL DEFAULT 1,
    trial_days      INT          NOT NULL DEFAULT 0,
    stripe_price_id VARCHAR(255),
    is_active       BOOLEAN      DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                        BIGSERIAL    PRIMARY KEY,
    user_id                   BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id                   BIGINT       NOT NULL REFERENCES subscription_plans(id),
    provider                  VARCHAR(50)  NOT NULL DEFAULT 'demo',
    provider_subscription_id  VARCHAR(255),
    provider_customer_id      VARCHAR(255),
    status                    VARCHAR(50)  NOT NULL DEFAULT 'active',
    current_period_start      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days',
    cancel_at_period_end      BOOLEAN      DEFAULT false,
    cancelled_at              TIMESTAMP,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_ref
    ON subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_wallet_transactions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      BIGINT NOT NULL,
    type        TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_wallet_user_id ON user_wallet_transactions(user_id);

CREATE TABLE IF NOT EXISTS user_cards (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_name        VARCHAR(255) NOT NULL,
    card_description VARCHAR(255),
    card_type        VARCHAR(50) NOT NULL,
    is_credit        BOOLEAN NOT NULL DEFAULT FALSE,
    card_number      VARCHAR(20) NOT NULL,
    cvv              VARCHAR(10),
    expiry_month     INT,
    expiry_year      INT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id);

-- Forum
CREATE TABLE IF NOT EXISTS forum_categories (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL UNIQUE,
    description   TEXT,
    display_order INT DEFAULT 0,
    is_pinned     BOOLEAN DEFAULT false,
    is_locked     BOOLEAN DEFAULT false,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS forum_threads (
    id          BIGSERIAL    PRIMARY KEY,
    category_id BIGINT       NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
    user_id     BIGINT       NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    content     TEXT         NOT NULL,
    reply_count INT     DEFAULT 0,
    is_pinned   BOOLEAN DEFAULT false,
    is_locked   BOOLEAN DEFAULT false,
    is_shared          BOOLEAN DEFAULT false,
    original_thread_id BIGINT  REFERENCES forum_threads(id) ON DELETE SET NULL,
    last_edited_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE forum_threads DROP COLUMN IF EXISTS view_count;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS original_thread_id BIGINT REFERENCES forum_threads(id) ON DELETE SET NULL;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS last_edited_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_forum_threads_category_id ON forum_threads(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_user_id     ON forum_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_created_at  ON forum_threads(created_at DESC);

CREATE TABLE IF NOT EXISTS thread_comments (
    id         BIGSERIAL PRIMARY KEY,
    thread_id  BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    content    TEXT   NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_thread_comments_thread_id ON thread_comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_comments_user_id   ON thread_comments(user_id);

CREATE TABLE IF NOT EXISTS thread_comment_likes (
    id                BIGSERIAL PRIMARY KEY,
    thread_comment_id BIGINT NOT NULL REFERENCES thread_comments(id) ON DELETE CASCADE,
    user_id           BIGINT NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(thread_comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_comment_likes_comment_id ON thread_comment_likes(thread_comment_id);
CREATE INDEX IF NOT EXISTS idx_thread_comment_likes_user_id    ON thread_comment_likes(user_id);

CREATE TABLE IF NOT EXISTS thread_likes (
    id         BIGSERIAL PRIMARY KEY,
    thread_id  BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_likes_thread_id ON thread_likes(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_likes_user_id   ON thread_likes(user_id);

CREATE TABLE IF NOT EXISTS thread_editors (
    thread_id BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_editors_thread ON thread_editors(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_editors_user ON thread_editors(user_id);

-- Inbox
CREATE TABLE IF NOT EXISTS inbox_conversations (
    id         BIGSERIAL PRIMARY KEY,
    is_group   BOOLEAN NOT NULL DEFAULT FALSE,
    title      VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inbox_conversation_participants (
    conversation_id BIGINT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id BIGINT DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS inbox_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
    sender_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT   NOT NULL,
    message_type    VARCHAR(20) NOT NULL DEFAULT 'text',
    attachment_url  TEXT,
    attachment_name TEXT,
    attachment_size BIGINT,
    attachment_mime TEXT,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation ON inbox_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sender       ON inbox_messages(sender_id);

-- Backfill for existing deployments: add new columns to inbox_messages
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS message_type    VARCHAR(20) NOT NULL DEFAULT 'text';
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS attachment_url  TEXT;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS attachment_mime TEXT;

-- User blocks
CREATE TABLE IF NOT EXISTS user_blocks (
    id         BIGSERIAL PRIMARY KEY,
    blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(64)  NOT NULL,
    message    TEXT         NOT NULL,
    route      VARCHAR(512) NOT NULL DEFAULT '',
    is_read    BOOLEAN      DEFAULT FALSE,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read   ON notifications(user_id, is_read);

-- Site config: branding, SEO, and page blocks.

-- Site config (key-value)
CREATE TABLE IF NOT EXISTS site_config (
    key        VARCHAR(255) PRIMARY KEY,
    value      JSONB        NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Page sections (ordered blocks)
CREATE TABLE IF NOT EXISTS page_sections (
    id            BIGSERIAL    PRIMARY KEY,
    display_order INT          NOT NULL DEFAULT 0,
    section_type  VARCHAR(50)  NOT NULL,
    heading       TEXT         NOT NULL DEFAULT '',
    subheading    TEXT         NOT NULL DEFAULT '',
    config        JSONB        NOT NULL DEFAULT '{}',
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_sections_order ON page_sections(display_order);

-- Page section items (cards/tiles within a section)
CREATE TABLE IF NOT EXISTS page_items (
    id                BIGSERIAL    PRIMARY KEY,
    page_section_id   BIGINT       NOT NULL REFERENCES page_sections(id) ON DELETE CASCADE,
    display_order     INT          NOT NULL DEFAULT 0,
    icon          VARCHAR(100) NOT NULL DEFAULT '',
    heading       TEXT         NOT NULL DEFAULT '',
    subheading    TEXT         NOT NULL DEFAULT '',
    image_url     TEXT         NOT NULL DEFAULT '',
    link_url      TEXT         NOT NULL DEFAULT '',
    config        JSONB        NOT NULL DEFAULT '{}',
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_items_section ON page_items(page_section_id, display_order);

-- Custom pages (block-builder content)
CREATE TABLE IF NOT EXISTS pages (
    id          BIGSERIAL    PRIMARY KEY,
    slug        VARCHAR(120) NOT NULL UNIQUE,
    title       VARCHAR(255) NOT NULL DEFAULT '',
    description TEXT         NOT NULL DEFAULT '',
    visibility  VARCHAR(20)  NOT NULL DEFAULT 'public',
    content     JSONB        NOT NULL DEFAULT '[]',
    owner_id    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public';

-- Drop legacy is_index column and its unique index if they exist.
DROP INDEX IF EXISTS pages_is_index_unique;
ALTER TABLE pages DROP COLUMN IF EXISTS is_index;

-- For existing databases: add owner_id if missing.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pages_owner ON pages(owner_id);

-- Editors junction table: grants edit access to users on specific pages.
CREATE TABLE IF NOT EXISTS page_editors (
    id         BIGSERIAL PRIMARY KEY,
    page_id    BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (page_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_page_editors_page ON page_editors(page_id);
CREATE INDEX IF NOT EXISTS idx_page_editors_user ON page_editors(user_id);

-- Page engagement: views, likes, comments

-- Old page_views table and pages.view_count replaced by resource_views (006).
DROP TABLE IF EXISTS page_views;
ALTER TABLE pages DROP COLUMN IF EXISTS view_count;

-- Page likes (one per user)
CREATE TABLE IF NOT EXISTS page_likes (
    id         BIGSERIAL PRIMARY KEY,
    page_id    BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_page_likes_page ON page_likes(page_id);
CREATE INDEX IF NOT EXISTS idx_page_likes_user ON page_likes(user_id);

-- Page comments
CREATE TABLE IF NOT EXISTS page_comments (
    id         BIGSERIAL PRIMARY KEY,
    page_id    BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_comments_page ON page_comments(page_id);
CREATE INDEX IF NOT EXISTS idx_page_comments_user ON page_comments(user_id);

-- Page comment likes
CREATE TABLE IF NOT EXISTS page_comment_likes (
    id                BIGSERIAL PRIMARY KEY,
    page_comment_id   BIGINT NOT NULL REFERENCES page_comments(id) ON DELETE CASCADE,
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_comment_id, user_id)
);

-- Data sources (evaluable code snippets for derived page sections)
CREATE TABLE IF NOT EXISTS data_sources (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    code        TEXT         NOT NULL DEFAULT '',
    files       JSONB        NOT NULL DEFAULT '{}',
    env_data    TEXT         NOT NULL DEFAULT '',
    created_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_data_sources_created_by ON data_sources(created_by);

-- Custom sections (reusable data-bound visualizations, like Superset charts)
CREATE TABLE IF NOT EXISTS custom_sections (
    id              BIGSERIAL    PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    datasource_id   BIGINT       NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    section_type    VARCHAR(50)  NOT NULL DEFAULT 'cards',
    config          JSONB        NOT NULL DEFAULT '{}',
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_custom_sections_datasource ON custom_sections(datasource_id);
CREATE INDEX IF NOT EXISTS idx_custom_sections_created_by ON custom_sections(created_by);

-- User page allocations (per-user custom page quotas)
CREATE TABLE IF NOT EXISTS user_page_allocations (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT   NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    max_pages  INT      NOT NULL DEFAULT 5,
    used_pages INT      NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_page_alloc_user ON user_page_allocations(user_id);

ALTER TABLE user_page_allocations ADD COLUMN IF NOT EXISTS max_pages  INT NOT NULL DEFAULT 5;
ALTER TABLE user_page_allocations ADD COLUMN IF NOT EXISTS used_pages INT NOT NULL DEFAULT 0;

-- Normalized custom-page sections. pages.content remains authoritative while
-- these tables run in shadow mode; see 030_page_section_shadow_storage.sql for
-- the incremental migration applied to existing deployments.
CREATE TABLE IF NOT EXISTS page_themes (
    page_id BIGINT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    schema_version INT NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_theme_tokens (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL REFERENCES page_themes(page_id) ON DELETE CASCADE,
    token_key VARCHAR(64) NOT NULL CHECK (token_key ~ '^[a-z][a-z0-9_-]*$'),
    label VARCHAR(120) NOT NULL,
    color_value VARCHAR(128) NOT NULL CHECK (length(btrim(color_value)) > 0),
    display_order INT NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 63),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (page_id, token_key),
    UNIQUE (page_id, display_order)
);

CREATE TABLE IF NOT EXISTS page_section_instances (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    source_index INT NOT NULL CHECK (source_index >= 0),
    legacy_key_kind VARCHAR(8) NOT NULL CHECK (legacy_key_kind IN ('number', 'string')),
    legacy_key TEXT NOT NULL CHECK (length(legacy_key) > 0),
    original_section_type VARCHAR(80) NOT NULL,
    section_type VARCHAR(80) NOT NULL CHECK (section_type IN ('hero','card_group','stat_cards','social_links','image_gallery','feature_grid','cta','event_highlights','profile_card','rich_text','code_editor','data_sources','derived_section','custom_section','form','qa','survey','poll','vote')),
    display_order INT NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    heading TEXT NOT NULL DEFAULT '',
    subheading TEXT NOT NULL DEFAULT '',
    shell_version INT NOT NULL DEFAULT 1 CHECK (shell_version = 1),
    layout VARCHAR(16) NOT NULL DEFAULT 'center' CHECK (layout IN ('left', 'center', 'right', 'wide')),
    container_width VARCHAR(16) NOT NULL DEFAULT 'content' CHECK (container_width IN ('narrow', 'content', 'wide', 'full')),
    margin_top DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_top BETWEEN -512 AND 512),
    margin_right DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_right BETWEEN -512 AND 512),
    margin_bottom DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_bottom BETWEEN -512 AND 512),
    margin_left DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (margin_left BETWEEN -512 AND 512),
    padding_top DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_top BETWEEN 0 AND 512),
    padding_right DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_right BETWEEN 0 AND 512),
    padding_bottom DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_bottom BETWEEN 0 AND 512),
    padding_left DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (padding_left BETWEEN 0 AND 512),
    animation VARCHAR(24) NOT NULL DEFAULT 'none' CHECK (animation IN ('none', 'fade-in', 'slide-up', 'slide-left', 'slide-right', 'zoom-in', 'bounce')),
    animation_intensity VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (animation_intensity IN ('subtle', 'normal', 'dramatic')),
    background_color JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    text_color JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    h1_color JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    h2_color JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    h3_color JSONB NOT NULL DEFAULT '{"mode":"inherit"}',
    content_scale DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (content_scale BETWEEN 0.5 AND 2),
    collapsible BOOLEAN NOT NULL DEFAULT FALSE,
    default_collapsed BOOLEAN NOT NULL DEFAULT FALSE,
    config_version INT NOT NULL DEFAULT 1 CHECK (config_version >= 1),
    config JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
    config_encoding VARCHAR(8) NOT NULL DEFAULT 'string' CHECK (config_encoding IN ('string', 'object')),
    quarantined_config JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quarantined_config) = 'object'),
    quarantined_section JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quarantined_section) = 'object'),
    alias_repairs JSONB NOT NULL DEFAULT '[]',
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (page_id, source_index),
    UNIQUE (page_id, legacy_key_kind, legacy_key),
    UNIQUE (id, page_id)
);
CREATE INDEX IF NOT EXISTS idx_page_section_instances_page_order ON page_section_instances(page_id, display_order, source_index);
CREATE INDEX IF NOT EXISTS idx_page_section_instances_type ON page_section_instances(section_type);

CREATE TABLE IF NOT EXISTS page_section_color_references (
    section_id BIGINT NOT NULL,
    page_id BIGINT NOT NULL,
    color_role VARCHAR(16) NOT NULL CHECK (color_role IN ('background', 'text', 'h1', 'h2', 'h3')),
    token_key VARCHAR(64) NOT NULL,
    PRIMARY KEY (section_id, color_role),
    FOREIGN KEY (section_id, page_id) REFERENCES page_section_instances(id, page_id) ON DELETE CASCADE,
    FOREIGN KEY (page_id, token_key) REFERENCES page_theme_tokens(page_id, token_key) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_page_section_color_refs_token ON page_section_color_references(page_id, token_key);

CREATE TABLE IF NOT EXISTS page_section_instance_items (
    id BIGSERIAL PRIMARY KEY,
    section_id BIGINT NOT NULL REFERENCES page_section_instances(id) ON DELETE CASCADE,
    source_index INT NOT NULL CHECK (source_index >= 0),
    legacy_key_kind VARCHAR(8) NOT NULL CHECK (legacy_key_kind IN ('number', 'string')),
    legacy_key TEXT NOT NULL CHECK (length(legacy_key) > 0),
    display_order INT NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    icon VARCHAR(120) NOT NULL DEFAULT '',
    heading TEXT NOT NULL DEFAULT '',
    subheading TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    config_version INT NOT NULL DEFAULT 1 CHECK (config_version = 1),
    config JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
    config_encoding VARCHAR(8) NOT NULL DEFAULT 'string' CHECK (config_encoding IN ('string', 'object')),
    quarantined_item JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quarantined_item) = 'object'),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (section_id, source_index),
    UNIQUE (section_id, legacy_key_kind, legacy_key)
);
CREATE INDEX IF NOT EXISTS idx_page_section_instance_items_order ON page_section_instance_items(section_id, display_order, source_index);

CREATE TABLE IF NOT EXISTS page_section_presets (
    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    source_page_id BIGINT REFERENCES pages(id) ON DELETE SET NULL,
    legacy_key TEXT,
    name VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    section_type VARCHAR(80) NOT NULL CHECK (section_type IN ('hero','card_group','stat_cards','social_links','image_gallery','feature_grid','cta','event_highlights','profile_card','rich_text','code_editor','data_sources','derived_section','custom_section','form','qa','survey','poll','vote')),
    shell_version INT NOT NULL DEFAULT 1 CHECK (shell_version = 1),
    shell JSONB NOT NULL CHECK (jsonb_typeof(shell) = 'object'),
    config_version INT NOT NULL DEFAULT 1 CHECK (config_version >= 1),
    config JSONB NOT NULL CHECK (jsonb_typeof(config) = 'object'),
    items JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_section_presets_owner_legacy ON page_section_presets(owner_id, legacy_key) WHERE legacy_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_section_presets_owner ON page_section_presets(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS page_section_responses (
    id BIGSERIAL PRIMARY KEY,
    section_id BIGINT NOT NULL REFERENCES page_section_instances(id) ON DELETE CASCADE,
    response_key VARCHAR(160) NOT NULL,
    respondent_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    respondent_user_key BIGINT NOT NULL DEFAULT 0 CHECK (respondent_user_key >= 0),
    idempotency_key_hash BYTEA,
    answers JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
    respondent_name TEXT NOT NULL DEFAULT '',
    status VARCHAR(24) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'pending', 'published', 'answered', 'archived')),
    moderator_answer TEXT NOT NULL DEFAULT '',
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (section_id, response_key)
);
ALTER TABLE page_section_responses
    ADD COLUMN IF NOT EXISTS respondent_user_key BIGINT NOT NULL DEFAULT 0
        CHECK (respondent_user_key >= 0);
UPDATE page_section_responses
SET respondent_user_key = respondent_user_id
WHERE respondent_user_key = 0 AND respondent_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_section_responses_idempotency ON page_section_responses(section_id, respondent_user_key, idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_section_responses_section_created ON page_section_responses(section_id, created_at DESC);

CREATE TABLE IF NOT EXISTS page_section_response_migrations (
    page_id BIGINT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    source_hash VARCHAR(64) NOT NULL,
    normalized_hash VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('matched', 'mismatch')),
    response_count INT NOT NULL DEFAULT 0 CHECK (response_count >= 0),
    interactive_sections INT NOT NULL DEFAULT 0 CHECK (interactive_sections >= 0),
    mismatch_codes JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(mismatch_codes) = 'array'),
    run_count BIGINT NOT NULL DEFAULT 1 CHECK (run_count >= 1),
    last_run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_section_response_migrations_status ON page_section_response_migrations(status, last_run_at);

CREATE TABLE IF NOT EXISTS page_section_quarantine (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    source_index INT NOT NULL CHECK (source_index >= 0),
    legacy_key_kind VARCHAR(8),
    legacy_key TEXT,
    reason_code VARCHAR(80) NOT NULL,
    safe_payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_section_quarantine_page ON page_section_quarantine(page_id, source_index);

CREATE TABLE IF NOT EXISTS page_section_shadow_runs (
    page_id BIGINT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    source_hash VARCHAR(64) NOT NULL,
    projection_hash VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('matched', 'quarantined', 'mismatch')),
    section_count INT NOT NULL DEFAULT 0 CHECK (section_count >= 0),
    item_count INT NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    quarantine_count INT NOT NULL DEFAULT 0 CHECK (quarantine_count >= 0),
    alias_repairs JSONB NOT NULL DEFAULT '[]',
    default_repairs JSONB NOT NULL DEFAULT '[]',
    mismatch_codes JSONB NOT NULL DEFAULT '[]',
    last_source_updated TIMESTAMP,
    run_count BIGINT NOT NULL DEFAULT 1 CHECK (run_count >= 1),
    last_run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consecutive_matched_runs BIGINT NOT NULL DEFAULT 0 CHECK (consecutive_matched_runs >= 0),
    matched_since TIMESTAMP,
    rollback_status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (rollback_status IN ('pending', 'matched', 'mismatch')),
    rollback_drilled_at TIMESTAMP,
    cutover_ready_at TIMESTAMP,
    legacy_write_count BIGINT NOT NULL DEFAULT 0 CHECK (legacy_write_count >= 0),
    last_legacy_write_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_section_shadow_runs_status ON page_section_shadow_runs(status, last_run_at);

-- Events (audit log for all user / system activity)
CREATE TABLE IF NOT EXISTS events (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    activity    VARCHAR(100) NOT NULL,
    resource    VARCHAR(100) NOT NULL DEFAULT '',
    resource_id BIGINT,
    meta        JSONB        NOT NULL DEFAULT '{}',
    ip          VARCHAR(45)  NOT NULL DEFAULT '',
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_user_id    ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_activity   ON events(activity);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_resource   ON events(resource, resource_id);

-- Email verification & 2FA columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified    BOOLEAN   DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
-- totp_secret and totp_enabled removed, now in auth_totp_secrets

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP    NOT NULL,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_verify_user   ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verify_token  ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verify_expiry ON email_verification_tokens(expires_at);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP    NOT NULL,
    used       BOOLEAN      DEFAULT false,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pw_reset_user   ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_token  ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_pw_reset_expiry ON password_reset_tokens(expires_at);

-- Auth tables (moved from migration 009)
CREATE TABLE IF NOT EXISTS auth_credentials (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_totp_secrets (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    totp_secret VARCHAR(255),
    enabled     BOOLEAN DEFAULT false,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_backup_codes (
    id        BIGSERIAL PRIMARY KEY,
    user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    used      BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mfa_challenge_required (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    required    BOOLEAN NOT NULL DEFAULT false,
    reason_code TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_history (
    id         SERIAL PRIMARY KEY,
    route      VARCHAR(255) NOT NULL,
    video_id   VARCHAR(255) NOT NULL,
    added_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    user_name  VARCHAR(255) NOT NULL,
    loop       BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_history_route ON media_history(route);
CREATE INDEX IF NOT EXISTS idx_media_history_created_at ON media_history(created_at);

-- Client backend provisioning. These baseline tables must precede the
-- blueprint rows in 002_seed.sql; migration 029 remains the idempotent bridge
-- for existing deployments created before provisioning was introduced.
CREATE TABLE IF NOT EXISTS app_blueprints (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    supported_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
    config_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provisioned_instances (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blueprint_id BIGINT NOT NULL REFERENCES app_blueprints(id) ON DELETE RESTRICT,
    version_tag VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    config_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
