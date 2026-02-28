-- 004_create_roles_and_permissions.sql

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

-- Create user_permissions table for granular permissions
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(id),
    UNIQUE(user_id, permission_id)
);

-- Insert default roles
INSERT INTO roles (id, name, description) VALUES
    ('10000000-0000-0000-0000-000000000001', 'admin', 'Administrator with full access'),
    ('10000000-0000-0000-0000-000000000002', 'moderator', 'Forum moderator'),
    ('10000000-0000-0000-0000-000000000003', 'member', 'Regular member'),
    ('10000000-0000-0000-0000-000000000004', 'banned', 'Banned user')
ON CONFLICT DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (id, name, category, description) VALUES
    ('20000000-0000-0000-0000-000000000001', 'forum.new-thread', 'forum', 'Create new forum threads'),
    ('20000000-0000-0000-0000-000000000002', 'forum.edit-thread', 'forum', 'Edit forum threads'),
    ('20000000-0000-0000-0000-000000000003', 'forum.delete-thread', 'forum', 'Delete forum threads'),
    ('20000000-0000-0000-0000-000000000004', 'forum.new-post', 'forum', 'Create new forum posts'),
    ('20000000-0000-0000-0000-000000000005', 'forum.edit-post', 'forum', 'Edit forum posts'),
    ('20000000-0000-0000-0000-000000000006', 'forum.delete-post', 'forum', 'Delete forum posts'),
    ('20000000-0000-0000-0000-000000000007', 'forum.moderate', 'forum', 'Moderate forums'),
    ('20000000-0000-0000-0000-000000000008', 'user.manage-roles', 'user', 'Manage user roles'),
    ('20000000-0000-0000-0000-000000000009', 'user.manage-permissions', 'user', 'Manage user permissions'),
    ('20000000-0000-0000-0000-000000000010', 'store.purchase', 'store', 'Purchase items from store')
ON CONFLICT DO NOTHING;

-- Assign permissions to roles
INSERT INTO role_permissions (role_id, permission_id) VALUES
    -- Members can create posts and threads
    ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000010'),
    
    -- Moderators have all forum permissions
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006'),
    ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007'),
    
    -- Admins have all permissions
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000007'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000008'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009'),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000010')
ON CONFLICT DO NOTHING;
