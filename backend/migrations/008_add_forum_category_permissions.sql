-- 008_add_forum_category_permissions.sql

-- Insert forum category permissions if they don't exist
INSERT INTO permissions (id, name, category, description) VALUES
    (11, 'forums.createCategory', 'forum', 'Create forum categories'),
    (12, 'forums.editCategory', 'forum', 'Edit forum categories'),
    (13, 'forums.deleteCategory', 'forum', 'Delete forum categories'),
    (14, 'forums.editAny', 'forum', 'Edit any forum thread/post'),
    (15, 'forums.deleteAny', 'forum', 'Delete any forum thread/post')
ON CONFLICT DO NOTHING;

-- Assign these permissions to admin role
INSERT INTO role_permissions (role_id, permission_id) VALUES
    (1, 11),
    (1, 12),
    (1, 13),
    (1, 14),
    (1, 15),
    -- Assign to moderator role
    (2, 14),
    (2, 15)
ON CONFLICT DO NOTHING;
