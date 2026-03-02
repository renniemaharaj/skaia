-- =============================================================================
-- 008_seed.sql  –  Initial data (roles, permissions, admin account, forum seed)
-- =============================================================================

-- ── Roles ─────────────────────────────────────────────────────────────────────
INSERT INTO roles (id, name, description) VALUES
    (1, 'admin',  'Administrator with full access'),
    (2, 'member', 'Regular member'),
    (3, 'banned', 'Banned user')
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('roles', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM roles), false);

-- ── Permissions ───────────────────────────────────────────────────────────────
INSERT INTO permissions (id, name, category, description) VALUES
    (1,  'forum.thread-new',            'forum', 'Create a thread in any category'),
    (2,  'forum.thread-delete',         'forum', 'Delete a forum thread of any user'),
    (3,  'forum.thread-edit',           'forum', 'Edit a forum thread of any user'),
    (4,  'forum.category-new',          'forum', 'Create a new forum category'),
    (5,  'forum.category-delete',       'forum', 'Delete any forum category'),
    (6,  'forum.category-edit',         'forum', 'Edit any forum category'),
    (7,  'forum.thread-comment-new',    'forum', 'Create a comment on any thread'),
    (8,  'forum.thread-comment-delete', 'forum', 'Delete any thread comment'),
    (9,  'user.manage-others',          'user',  'Manage profile, permissions and roles of any user'),
    (10, 'user.suspend',                'user',  'Suspend or unsuspend any user')
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('permissions', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM permissions), false);

-- ── Role → permission assignments ─────────────────────────────────────────────
-- member: can post threads and comments
INSERT INTO role_permissions (role_id, permission_id) VALUES
    (2, 1),   -- forum.thread-new
    (2, 7)    -- forum.thread-comment-new
ON CONFLICT DO NOTHING;

-- admin: every permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'admin'), p.id
FROM   permissions p
ON CONFLICT DO NOTHING;

-- ── Default admin account ─────────────────────────────────────────────────────
-- Password: password123
-- Re-hash with: bcrypt.GenerateFromPassword([]byte("password123"), 10)
INSERT INTO users (id, username, email, password_hash, display_name, bio,
                   avatar_url, banner_url, photo_url,
                   is_suspended, created_at, updated_at)
SELECT 1,
       'admin',
       'admin@skaiacraft.local',
       '$2a$10$5rGYDGGQ32l5bhO5m0uph.Xr11UMG2ox9eDBEFAYJRQyccw7FWYEG',
       'Administrator',
       'Default administrator account',
       '', '', '',
       FALSE,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

SELECT setval(pg_get_serial_sequence('users', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM users), false);

INSERT INTO user_roles (user_id, role_id)
SELECT 1, 1
WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = 1 AND role_id = 1);

-- ── Default forum categories ──────────────────────────────────────────────────
INSERT INTO forum_categories (id, name, description, display_order) VALUES
    (1, 'General Discussion',    'Talk about anything related to our community', 1),
    (2, 'Support',               'Get help with server issues',                  2),
    (3, 'Events & Competitions', 'Participate in community events',               3)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('forum_categories', 'id'),
              (SELECT COALESCE(MAX(id), 0) + 1 FROM forum_categories), false);

-- ── Welcome threads ───────────────────────────────────────────────────────────
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
             'Welcome to our community forum! This is a place to discuss topics related to our server, share ideas, and help each other out. Feel free to introduce yourself and let us know what you''re interested in.',
             234, 12),
            (v_cat_id, v_admin_id,
             'Server updates and news',
             'Stay tuned for the latest updates and news about our server. We''re constantly working on improvements and new features to enhance your experience.',
             189, 8)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
