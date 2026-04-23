-- Seed data: roles, permissions, admin account, default forum categories.


INSERT INTO roles (id, name, description, power_level) VALUES
    (1, 'admin',     'Administrator with full access',                       100),
    (2, 'member',    'Regular member',                                        10),
    (3, 'banned',    'Banned user',                                            0),
    (4, 'moderator', 'Can moderate forum content and manage users',           50),
    (100, 'superuser', 'Superuser with unrestricted power',                  255)
ON CONFLICT (id) DO UPDATE
    SET power_level = EXCLUDED.power_level;

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

INSERT INTO users (id, username, email, password_hash, display_name, bio,
                   avatar_url, banner_url, photo_url,
                   is_suspended, created_at, updated_at)
SELECT 1, 'admin', 'admin@skaiacraft.local', '$placeholder$',
       'Administrator', 'Default administrator account',
       '/banner.png', '/banner.png', '/banner.png', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

SELECT setval(pg_get_serial_sequence('users', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM users), false);

-- Assign admin to superuser role
INSERT INTO user_roles (user_id, role_id)
SELECT 1, (SELECT id FROM roles WHERE name = 'superuser')
WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 1 AND role_id = (SELECT id FROM roles WHERE name = 'superuser'));

INSERT INTO user_roles (user_id, role_id)
SELECT 1, (SELECT id FROM roles WHERE name = 'admin')
WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 1 AND role_id = (SELECT id FROM roles WHERE name = 'admin'));

-- Default forum categories
INSERT INTO forum_categories (id, name, description, display_order) VALUES
    (1, 'General Discussion',    'Talk about anything related to our community', 1),
    (2, 'Support',               'Get help with server issues',                  2),
    (3, 'Events & Competitions', 'Participate in community events',              3)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('forum_categories', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM forum_categories), false);

-- Welcome threads
DO $$
DECLARE
    v_admin_id BIGINT;
    v_cat_id   BIGINT;
BEGIN
    SELECT id INTO v_admin_id FROM users            WHERE username = 'admin'             LIMIT 1;
    SELECT id INTO v_cat_id   FROM forum_categories WHERE name    = 'General Discussion' LIMIT 1;

    IF v_admin_id IS NOT NULL AND v_cat_id IS NOT NULL THEN
        INSERT INTO forum_threads (category_id, user_id, title, content, view_count, reply_count)
        VALUES
            (v_cat_id, v_admin_id,
             'Welcome to the forum!',
             'Welcome to our community forum!',
             0, 0),
            (v_cat_id, v_admin_id,
             'Server updates and news',
             'Stay tuned for the latest updates.',
             0, 0)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
-- Home/manage permission and default site config seed
INSERT INTO permissions (name, category, description) VALUES
    ('home.manage', 'home', 'Edit landing page sections, branding, and site config'),
    ('home.page-delete', 'home', 'Delete custom pages'),
    ('events.view', 'events', 'View the events audit log')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name IN ('home.manage', 'home.page-delete', 'events.view')
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

-- ── "Get Started" seed page ─────────────────────────────────────────────────
-- A showcase page demonstrating available block types. Set as landing page via config.
INSERT INTO pages (slug, title, description, content, visibility)
SELECT 'get-started', 'Get Started', 'A quick tour of the page builder blocks available on your site.',
       '[
         {
           "id": "gs-hero",
           "display_order": 1,
           "section_type": "hero",
           "heading": "Welcome to Your Site",
           "subheading": "This is a sample landing page created by the seed. Customise or replace it from the page builder.",
           "config": {},
           "items": []
         },
         {
           "id": "gs-features",
           "display_order": 2,
           "section_type": "features",
           "heading": "Feature Highlights",
           "subheading": "Showcase what makes your community special.",
           "config": {},
           "items": [
             {"id": "gs-f1", "display_order": 1, "icon": "star",    "heading": "Block Builder",  "subheading": "Drag-and-drop sections to build pages visually.", "image_url": "", "link_url": ""},
             {"id": "gs-f2", "display_order": 2, "icon": "users",   "heading": "Community",      "subheading": "Forums, comments, and real-time presence.", "image_url": "", "link_url": ""},
             {"id": "gs-f3", "display_order": 3, "icon": "palette", "heading": "Theming",        "subheading": "Full branding control from the admin panel.", "image_url": "", "link_url": ""}
           ]
         },
         {
           "id": "gs-cta",
           "display_order": 3,
           "section_type": "cta",
           "heading": "Ready to build?",
           "subheading": "Head to the admin panel and start customising your pages.",
           "config": {},
           "items": []
         }
       ]'::jsonb, 'public'
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE slug = 'get-started');

INSERT INTO site_config (key, value)
VALUES ('landing_page_slug', '"get-started"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── System "noreply" user for automated inbox messages ──────────────────────
INSERT INTO users (username, email, password_hash, display_name, bio,
                   avatar_url, banner_url, photo_url,
                   is_suspended, created_at, updated_at)
SELECT 'noreply', 'noreply@system.local',
       '$2a$12$000000000000000000000uGhostyLocked0000000000000000000',
       'System', 'Automated system notifications — this account cannot be messaged.',
       '', '', '', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'noreply');
