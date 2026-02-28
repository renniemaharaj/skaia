-- 008_add_forum_category_permissions.sql

-- Insert forum category permissions if they don't exist
INSERT INTO permissions (id, name, category, description) VALUES
    ('20000000-0000-0000-0000-000000000011', 'forums.createCategory', 'forum', 'Create forum categories'),
    ('20000000-0000-0000-0000-000000000012', 'forums.editCategory', 'forum', 'Edit forum categories'),
    ('20000000-0000-0000-0000-000000000013', 'forums.deleteCategory', 'forum', 'Delete forum categories'),
    ('20000000-0000-0000-0000-000000000014', 'forums.editAny', 'forum', 'Edit any forum thread/post'),
    ('20000000-0000-0000-0000-000000000015', 'forums.deleteAny', 'forum', 'Delete any forum thread/post')
ON CONFLICT DO NOTHING;

-- Assign these permissions to admin role
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000012'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000013'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000015'),
    -- Assign to moderator role
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000014'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000015')
ON CONFLICT DO NOTHING;
