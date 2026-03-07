-- Site configuration: branding, SEO, and landing page blocks.

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
    section_type  VARCHAR(50)  NOT NULL,  -- hero, card_group, image_gallery, feature_grid, social_links, cta
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

-- ── home.manage permission ──────────────────────────────────────────────────
INSERT INTO permissions (name, category, description) VALUES
    ('home.manage', 'home', 'Edit landing page sections, branding, and site config')
ON CONFLICT (name) DO NOTHING;

-- Grant home.manage to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name = 'home.manage'
ON CONFLICT DO NOTHING;

-- ── Seed default branding ───────────────────────────────────────────────────
INSERT INTO site_config (key, value) VALUES
    ('branding', '{
        "site_name": "CUEBALLCRAFT SKAIACRAFT",
        "tagline": "A Premium Vanilla Minecraft Experience",
        "logo_url": "/logo.png",
        "favicon_url": "/favicon.ico"
    }'::jsonb),
    ('seo', '{
        "title": "Cueballcraft Skaiacraft – Premium Vanilla Minecraft",
        "description": "A premium vanilla Minecraft server with a community spanning over 12 years.",
        "og_image": "/banner_7783x7783.png"
    }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Seed default landing sections ───────────────────────────────────────────

-- 1. Hero
INSERT INTO landing_sections (id, display_order, section_type, heading, subheading, config) VALUES
(1, 1, 'hero', 'CUEBALLCRAFT SKAIACRAFT', 'A Premium Vanilla Minecraft Experience', '{
    "background_image": "/banner_7783x7783.png"
}'::jsonb);

-- 2. Card group – Community Legacy
INSERT INTO landing_sections (id, display_order, section_type, heading, subheading) VALUES
(2, 2, 'card_group', '12+ Years of Community Excellence', 'A Legacy Built on Trust, Inclusivity, and Fun');

INSERT INTO landing_items (section_id, display_order, heading, subheading) VALUES
(2, 1, 'Established & Trusted', 'Over 12 years of continuous operation with a dedicated community of players who believe in authentic Minecraft experiences.'),
(2, 2, 'Family Friendly', 'We maintain a welcoming, family-oriented environment where players of all ages can enjoy safe and inclusive gameplay.'),
(2, 3, 'Strong Community', 'Our players have built lasting friendships and memories together, creating a thriving community that grows every day.');

-- 3. Stats (icon cards)
INSERT INTO landing_sections (id, display_order, section_type, heading, subheading) VALUES
(3, 3, 'stat_cards', '', '');

INSERT INTO landing_items (section_id, display_order, icon, heading, subheading) VALUES
(3, 1, 'CheckCircle', 'Server Status', 'Online'),
(3, 2, 'Users', 'Players Online', '47'),
(3, 3, 'TrendingUp', 'Monthly Goal', '75% funded'),
(3, 4, 'Star', 'Last Supporter', 'CreeperSlayer92');

-- 4. Social links
INSERT INTO landing_sections (id, display_order, section_type, heading, subheading, config) VALUES
(4, 4, 'social_links', '', '', '{
    "links": [
        {"name": "Discord",   "icon": "MessageCircle", "url": "https://discord.gg/Ngt4RkNUNv"},
        {"name": "X",         "icon": "Twitter",        "url": "https://x.com/SkaiaGaming"},
        {"name": "Instagram", "icon": "Instagram",      "url": "https://www.instagram.com/skaiagram/"}
    ]
}'::jsonb);

-- 5. Image gallery – Showcase
INSERT INTO landing_sections (id, display_order, section_type, heading, subheading) VALUES
(5, 5, 'image_gallery', 'Explore the Server', 'Discover amazing builds and landscapes');

INSERT INTO landing_items (section_id, display_order, heading, image_url) VALUES
(5, 1, 'Epic Builds',     '/fullscreen_mansion.webp'),
(5, 2, 'Grand Pathways',  '/fullscreen_pathway.webp'),
(5, 3, 'Natural Beauty',  '/fullscreen_tree.webp');

-- 6. Feature grid
INSERT INTO landing_sections (id, display_order, section_type, heading, subheading) VALUES
(6, 6, 'feature_grid', 'What can you expect from Cueballcraft, Skaiacraft', 'Everything you need for the ultimate vanilla Minecraft experience!');

INSERT INTO landing_items (section_id, display_order, icon, heading, subheading) VALUES
(6, 1, 'Gamepad2',     'Partial Vanilla',    'Enjoy authentic Minecraft gameplay with custom enhancements'),
(6, 2, 'TrendingUp',   'Latest Versions',    'Support for the newest Minecraft versions on our custom framework'),
(6, 3, 'Users',        'Loyal Community',    'Join a welcoming playerbase with experienced staff members'),
(6, 4, 'Star',         'Custom Apps',        'Unique features and tools designed for enjoyment'),
(6, 5, 'CheckCircle',  'Reliable Support',   'Helpful moderators ready to assist with any questions'),
(6, 6, 'ShoppingCart', 'Premium Items',      'Shop for ranks, cosmetics, and exclusive content');

SELECT setval(pg_get_serial_sequence('landing_sections', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM landing_sections), false);
