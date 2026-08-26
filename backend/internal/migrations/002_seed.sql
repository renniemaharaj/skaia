-- Seed data: roles, permissions, admin account, default forum categories.

INSERT INTO roles (id, name, description, power_level, theme_color) VALUES
    (1, 'admin',     'Administrator with full access',                       100, NULL),
    (2, 'member',    'Regular member',                                        10, NULL),
    (3, 'banned',    'Banned user',                                            0, NULL),
    (4, 'moderator', 'Can moderate forum content and manage users',           50, NULL),
    (100, 'superuser', 'Superuser with unrestricted power',                  255, '#5b9e8e')
ON CONFLICT (id) DO UPDATE
    SET power_level = EXCLUDED.power_level,
        theme_color = COALESCE(NULLIF(roles.theme_color, ''), EXCLUDED.theme_color);

SELECT setval(pg_get_serial_sequence('roles', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM roles), false);

-- Permissions
INSERT INTO permissions (id, name, category, description) VALUES
    (1,  'forum.thread-new',            'forum',    'Create a thread in any category'),
    (2,  'forum.thread-delete',         'forum',    'Delete a forum thread of any user'),
    (3,  'forum.thread-edit',           'forum',    'Edit a forum thread of any user'),
    (4,  'forum.category-new',          'forum',    'Create a new forum category'),
    (5,  'forum.category-delete',       'forum',    'Delete any forum category'),
    (6,  'forum.category-edit',         'forum',    'Edit any forum category'),
    (7,  'forum.thread-comment-new',    'forum',    'Create a comment on any thread'),
    (8,  'forum.thread-comment-delete', 'forum',    'Delete any thread comment'),
    (9,  'user.manage-others',          'user',     'Manage profile, permissions and roles of any user'),
    (10, 'user.suspend',                'user',     'Suspend or unsuspend any user'),
    (11, 'presence.tp-here',            'presence', 'Teleport another user to your current page'),
    (12, 'store.product-new',           'store',    'Create new store products'),
    (13, 'store.product-delete',        'store',    'Delete store products'),
    (14, 'store.product-edit',          'store',    'Edit existing store products'),
    (15, 'store.manageCategories',      'store',    'Create, edit and delete store categories'),
    (16, 'store.manageOrders',          'store',    'View and update the status of any order'),
    (17, 'store.managePlans',           'store',    'Create, edit and delete subscription plans')
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('permissions', 'id'), 18, false);

-- Role => permission assignments
INSERT INTO role_permissions (role_id, permission_id) VALUES
    (2, 1),   -- member: forum.thread-new
    (2, 7)    -- member: forum.thread-comment-new
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
    (4, 1),   -- moderator: forum.thread-new
    (4, 2),   -- moderator: forum.thread-delete
    (4, 3),   -- moderator: forum.thread-edit
    (4, 7),   -- moderator: forum.thread-comment-new
    (4, 8),   -- moderator: forum.thread-comment-delete
    (4, 9)    -- moderator: user.manage-others
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
    (1, 1),   -- admin: forum.thread-new
    (1, 2),   -- admin: forum.thread-delete
    (1, 3),   -- admin: forum.thread-edit
    (1, 4),   -- admin: forum.category-new
    (1, 5),   -- admin: forum.category-delete
    (1, 6),   -- admin: forum.category-edit
    (1, 7),   -- admin: forum.thread-comment-new
    (1, 8),   -- admin: forum.thread-comment-delete
    (1, 9),   -- admin: user.manage-others
    (1, 10),  -- admin: user.suspend
    (1, 11),  -- admin: presence.tp-here
    (1, 12),  -- admin: store.product-new
    (1, 13),  -- admin: store.product-delete
    (1, 14),  -- admin: store.product-edit
    (1, 15),  -- admin: store.manageCategories
    (1, 16),  -- admin: store.manageOrders
    (1, 17)   -- admin: store.managePlans
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
    (100, 1),   -- superuser: forum.thread-new
    (100, 2),   -- superuser: forum.thread-delete
    (100, 3),   -- superuser: forum.thread-edit
    (100, 4),   -- superuser: forum.category-new
    (100, 5),   -- superuser: forum.category-delete
    (100, 6),   -- superuser: forum.category-edit
    (100, 7),   -- superuser: forum.thread-comment-new
    (100, 8),   -- superuser: forum.thread-comment-delete
    (100, 9),   -- superuser: user.manage-others
    (100, 10),  -- superuser: user.suspend
    (100, 11),  -- superuser: presence.tp-here
    (100, 12),  -- superuser: store.product-new
    (100, 13),  -- superuser: store.product-delete
    (100, 14),  -- superuser: store.product-edit
    (100, 15),  -- superuser: store.manageCategories
    (100, 16),  -- superuser: store.manageOrders
    (100, 17)   -- superuser: store.managePlans
ON CONFLICT DO NOTHING;

-- superuser: every permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'superuser'), p.id
FROM   permissions p
ON CONFLICT DO NOTHING;

-- Insert admin user (without password_hash)
INSERT INTO users (id, username, email, display_name, bio,
                   avatar_url, banner_url, photo_url,
                   is_suspended, created_at, updated_at)
SELECT 1, 'admin', 'admin@skaiacraft.local',
       'Administrator', 'Default administrator account',
       '/banner.png', '/banner.png', '/banner.png', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT INTO auth_credentials (user_id, password_hash, created_at, updated_at)
SELECT 1, '$placeholder$', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM auth_credentials WHERE user_id = 1);

SELECT setval(pg_get_serial_sequence('users', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM users), false);

-- Assign admin to superuser role
INSERT INTO user_roles (user_id, role_id)
SELECT 1, (SELECT id FROM roles WHERE name = 'superuser')
WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 1 AND role_id = (SELECT id FROM roles WHERE name = 'superuser'));

INSERT INTO user_roles (user_id, role_id)
SELECT 1, (SELECT id FROM roles WHERE name = 'admin')
WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 1 AND role_id = (SELECT id FROM roles WHERE name = 'admin'));


-- Home/manage permission and default site config seed
INSERT INTO permissions (name, category, description) VALUES
    ('home.manage', 'home', 'Edit landing page sections, branding, and site config'),
    ('home.page-delete', 'home', 'Delete custom pages'),
    ('docs.create', 'docs', 'Create documentation sets'),
    ('docs.manage', 'docs', 'Manage any documentation set'),
    ('events.view', 'events', 'View the events audit log'),
    ('rankings.manage', 'rankings', 'Manage ranked datasets and seasons'),
    ('rankings.produce', 'rankings', 'Submit idempotent ranked dataset updates'),
    ('community.manage', 'community', 'Moderate proposal decisions and managed community workflows'),
    ('community.publication-edit', 'community', 'Edit community publications owned by other users'),
    ('community.publication-delete', 'community', 'Delete community publications owned by other users')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name IN ('home.manage', 'home.page-delete', 'docs.create', 'docs.manage', 'events.view', 'rankings.manage', 'rankings.produce', 'community.manage', 'community.publication-edit', 'community.publication-delete')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'superuser' AND p.name IN ('docs.create', 'docs.manage', 'rankings.manage', 'rankings.produce', 'community.manage', 'community.publication-edit', 'community.publication-delete')
ON CONFLICT DO NOTHING;

INSERT INTO site_config (key, value) VALUES
    ('branding', '{
        "site_name": "",
        "tagline": "",
        "logo_url": "/banner.png",
        "favicon_url": "/banner.png",
        "header_title": "",
        "header_subtitle": "",
        "header_variant": 0,
        "menu_variant": 0
    }'::jsonb),
    ('seo', '{
        "title": "",
        "description": "",
        "og_image": "/banner.png"
    }'::jsonb),
    ('footer', '{
        "variant": 0,
        "site_title": "",
        "site_description": "",
        "community_heading": "",
        "community_items": [],
        "copyright_text": "",
        "quick_links": [],
        "contact_heading": "",
        "contact_text": "",
        "tagline": "",
        "social_links": []
    }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Go Web Platform capability-tour seed page. Set as landing page via config.
INSERT INTO pages (slug, title, description, content, visibility)
SELECT 'get-started', 'Go Web Platform', 'Build, publish, connect, and grow with the capabilities included in Go Web Platform.',
       '[
         {
           "id": "gwp-hero",
           "display_order": 1,
           "section_type": "hero",
           "heading": "Build what your community needs",
           "subheading": "Go Web Platform brings publishing, data, participation, commerce, and real-time connection into one tenant-ready experience.",
           "config": "{\"background_image\":\"/banner_7783x7783.png\",\"tint_color\":\"#07111f\",\"tint_opacity\":0.72,\"variant\":1}",
           "items": []
         },
         {
           "id": "gwp-foundation",
           "display_order": 2,
           "section_type": "stat_cards",
           "heading": "One foundation, many experiences",
           "subheading": "Start with native tools that share the same identity, permissions, content, and responsive design system.",
           "config": "{}",
           "items": [
             {"id": "gwp-foundation-pages", "section_id": "gwp-foundation", "display_order": 1, "icon": "Compass", "heading": "Visual publishing", "subheading": "Compose responsive pages from reusable sections and rich media.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-foundation-live", "section_id": "gwp-foundation", "display_order": 2, "icon": "Zap", "heading": "Live by default", "subheading": "Keep conversations, presence, notifications, and page updates moving in real time.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-foundation-tenant", "section_id": "gwp-foundation", "display_order": 3, "icon": "Shield", "heading": "Tenant ready", "subheading": "Apply independent branding, permissions, data, domains, and operational controls.", "image_url": "", "link_url": "", "config": "{}"}
           ]
         },
         {
           "id": "gwp-create",
           "display_order": 3,
           "section_type": "feature_grid",
           "heading": "Create, connect, and publish",
           "subheading": "Use focused tools on their own or combine them into a complete member experience.",
           "config": "{}",
           "items": [
             {"id": "gwp-create-pages", "section_id": "gwp-create", "display_order": 1, "icon": "Compass", "heading": "Pages and content", "subheading": "Build landing pages, documentation, galleries, profiles, event highlights, and reusable content sections.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-create-data", "section_id": "gwp-create", "display_order": 2, "icon": "TrendingUp", "heading": "Data-powered sections", "subheading": "Connect protected datasources to cards, tables, statistics, and reusable component groups.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-create-interactive", "section_id": "gwp-create", "display_order": 3, "icon": "CheckCircle", "heading": "Participation tools", "subheading": "Collect structured forms, moderated questions, surveys, polls, and confirmed votes.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-create-community", "section_id": "gwp-create", "display_order": 4, "icon": "Users", "heading": "Community workflows", "subheading": "Bring forums, proposals, showcases, events, documentation, and member discovery together.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-create-commerce", "section_id": "gwp-create", "display_order": 5, "icon": "ShoppingCart", "heading": "Commerce and rewards", "subheading": "Offer products, wallets, fulfilment, external-event rewards, and configurable rankings.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-create-media", "section_id": "gwp-create", "display_order": 6, "icon": "Globe", "heading": "Media and integrations", "subheading": "Publish rich media and extend operations through Frappe, Superset, and tenant-managed services.", "image_url": "", "link_url": "", "config": "{}"}
           ]
         },
         {
           "id": "gwp-connect",
           "display_order": 4,
           "section_type": "card_group",
           "heading": "Turn audiences into active communities",
           "subheading": "Communication and participation share one responsive experience across desktop and mobile.",
           "config": "{}",
           "items": [
             {"id": "gwp-connect-conversation", "section_id": "gwp-connect", "display_order": 1, "icon": "MessageCircle", "heading": "Conversation that stays organized", "subheading": "Use forums, replies, inbox conversations, notifications, and group chat to keep people connected.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-connect-live", "section_id": "gwp-connect", "display_order": 2, "icon": "Headphones", "heading": "Meet in real time", "subheading": "Add room presence, voice, video, screen sharing, shared cursors, and live route awareness.", "image_url": "", "link_url": "", "config": "{}"},
             {"id": "gwp-connect-participate", "section_id": "gwp-connect", "display_order": 3, "icon": "Award", "heading": "Invite meaningful participation", "subheading": "Run events, proposals, attendance, voting, rewards, and leaderboards with permission-aware controls.", "image_url": "", "link_url": "", "config": "{}"}
           ]
         },
         {
           "id": "gwp-adapt",
           "display_order": 5,
           "section_type": "rich_text",
           "heading": "",
           "subheading": "",
           "config": "{\"content\":\"<h2>Designed to become your platform</h2><p>Shape the experience with tenant branding, configurable navigation, feature controls, granular permissions, custom pages, reusable data-backed components, and integrations. Go Web Platform keeps public discovery, authenticated collaboration, and operator workflows on the same secure foundation.</p><p><strong>Start with the capabilities you need today.</strong> Enable more as your community, organization, or product grows.</p>\"}",
           "items": []
         },
         {
           "id": "gwp-cta",
           "display_order": 6,
           "section_type": "cta",
           "heading": "Make it unmistakably yours",
           "subheading": "Use the page builder and administration tools to choose your content, capabilities, branding, and community experience.",
           "config": "{}",
           "items": []
         }
       ]'::jsonb, 'public'
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'get-started');

INSERT INTO site_config (key, value)
VALUES ('landing_page_slug', '"get-started"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- System "noreply" user for automated inbox messages

-- Insert noreply user (without password_hash)
INSERT INTO users (username, email, display_name, bio,
                                     avatar_url, banner_url, photo_url,
                                     is_suspended, created_at, updated_at)
SELECT 'noreply', 'noreply@system.local',
             'System', 'Automated system notifications - this account cannot be messaged.',
             '', '', '', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'noreply');

-- Insert noreply credentials in auth_credentials (locked/disabled password)
INSERT INTO auth_credentials (user_id, password_hash, created_at, updated_at)
SELECT id, '$2a$12$000000000000000000000uGhostyLocked0000000000000000000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM users WHERE username = 'noreply'
    AND NOT EXISTS (SELECT 1 FROM auth_credentials WHERE user_id = users.id);

-- Provisioning Blueprints Seed Data
INSERT INTO app_blueprints (name, description, is_active) VALUES
    ('Frappe Framework', 'Enterprise Multi-tenant ERP and application framework', true),
    ('Apache Superset', 'Modern data exploration and visualization platform', true)
ON CONFLICT (name) DO NOTHING;
