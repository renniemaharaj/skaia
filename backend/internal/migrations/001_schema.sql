-- Schema for a fresh database. Prices are stored as BIGINT cents.

-- Bootstrap application role
DO $$ BEGIN
  CREATE ROLE skaia_user WITH LOGIN PASSWORD '{{PGPASSWORD}}';
EXCEPTION WHEN DUPLICATE_OBJECT THEN
  ALTER ROLE skaia_user PASSWORD '{{PGPASSWORD}}';
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
    password_hash    VARCHAR(255) NOT NULL,
    display_name     VARCHAR(255),
    avatar_url       TEXT,
    banner_url       TEXT,
    photo_url        TEXT,
    bio              TEXT,
    discord_id       VARCHAR(255),
    is_suspended     BOOLEAN   DEFAULT false,
    suspended_at     TIMESTAMP,
    suspended_reason TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);

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

-- Roles and permissions
CREATE TABLE IF NOT EXISTS roles (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    power_level INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS power_level INT NOT NULL DEFAULT 0;

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
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    price           BIGINT    NOT NULL,
    image_url       TEXT,
    stock           INT       DEFAULT 0,
    original_price  BIGINT,
    stock_unlimited BOOLEAN   DEFAULT false,
    is_active       BOOLEAN   DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

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

-- Forum
CREATE TABLE IF NOT EXISTS forum_categories (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL UNIQUE,
    description   TEXT,
    display_order INT DEFAULT 0,
    is_locked     BOOLEAN DEFAULT false,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE forum_categories ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS forum_threads (
    id          BIGSERIAL    PRIMARY KEY,
    category_id BIGINT       NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
    user_id     BIGINT       NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    content     TEXT         NOT NULL,
    view_count  INT     DEFAULT 0,
    reply_count INT     DEFAULT 0,
    is_pinned   BOOLEAN DEFAULT false,
    is_locked   BOOLEAN DEFAULT false,
    is_shared          BOOLEAN DEFAULT false,
    original_thread_id BIGINT  REFERENCES forum_threads(id) ON DELETE SET NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS original_thread_id BIGINT REFERENCES forum_threads(id) ON DELETE SET NULL;
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

-- Inbox
CREATE TABLE IF NOT EXISTS inbox_conversations (
    id         BIGSERIAL PRIMARY KEY,
    user1_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id)
);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_user1 ON inbox_conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_user2 ON inbox_conversations(user2_id);

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

-- Site config: branding, SEO, and landing page blocks.

-- ── Site config (key-value) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_config (
    key        VARCHAR(255) PRIMARY KEY,
    value      JSONB        NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── Landing page sections (ordered blocks) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS landing_sections (
    id            BIGSERIAL    PRIMARY KEY,
    display_order INT          NOT NULL DEFAULT 0,
    section_type  VARCHAR(50)  NOT NULL,
    heading       TEXT         NOT NULL DEFAULT '',
    subheading    TEXT         NOT NULL DEFAULT '',
    config        JSONB        NOT NULL DEFAULT '{}',
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_landing_sections_order ON landing_sections(display_order);

-- ── Landing section items (cards/tiles within a section) ────────────────────
CREATE TABLE IF NOT EXISTS landing_items (
    id            BIGSERIAL    PRIMARY KEY,
    section_id    BIGINT       NOT NULL REFERENCES landing_sections(id) ON DELETE CASCADE,
    display_order INT          NOT NULL DEFAULT 0,
    icon          VARCHAR(100) NOT NULL DEFAULT '',
    heading       TEXT         NOT NULL DEFAULT '',
    subheading    TEXT         NOT NULL DEFAULT '',
    image_url     TEXT         NOT NULL DEFAULT '',
    link_url      TEXT         NOT NULL DEFAULT '',
    config        JSONB        NOT NULL DEFAULT '{}',
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_landing_items_section ON landing_items(section_id, display_order);

-- ── Custom pages (block-builder content) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
    id          BIGSERIAL    PRIMARY KEY,
    slug        VARCHAR(120) NOT NULL UNIQUE,
    title       VARCHAR(255) NOT NULL DEFAULT '',
    description TEXT         NOT NULL DEFAULT '',
    is_index    BOOLEAN      NOT NULL DEFAULT FALSE,
    visibility  VARCHAR(20)  NOT NULL DEFAULT 'public',
    content     JSONB        NOT NULL DEFAULT '[]',
    owner_id    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public';

-- Ensure at most one page can be the index (homepage).
CREATE UNIQUE INDEX IF NOT EXISTS pages_is_index_unique
    ON pages (is_index) WHERE is_index = TRUE;

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

-- ── Page engagement: views, likes, comments ─────────────────────────────────

-- Track unique page views per user (or anonymous via session)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS page_views (
    id         BIGSERIAL PRIMARY KEY,
    page_id    BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    viewed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_views_page ON page_views(page_id);
CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(user_id);

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

-- ── Data sources (evaluable code snippets for derived page sections) ────────
CREATE TABLE IF NOT EXISTS data_sources (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    code        TEXT         NOT NULL DEFAULT '',
    created_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_data_sources_created_by ON data_sources(created_by);

-- ── Custom sections (reusable data-bound visualizations, like Superset charts) ──
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

-- ── User page allocations (per-user custom page quotas) ─────────────────────
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

-- ── Events (audit log for all user / system activity) ───────────────────────
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
