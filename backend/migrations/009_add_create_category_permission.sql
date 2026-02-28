-- 009_add_create_category_permission.sql

-- Insert the missing forum.createCategory permission
INSERT INTO permissions (id, name, category, description) VALUES
    (11, 'forums.createCategory', 'forum', 'Create new forum categories')
ON CONFLICT (name) DO NOTHING;

-- Assign this permission to admin role
INSERT INTO role_permissions (role_id, permission_id) VALUES
    (1, 11)
ON CONFLICT DO NOTHING;
