-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by BIGINT REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

-- Create user_permissions table for granular permissions
CREATE TABLE IF NOT EXISTS user_permissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by BIGINT REFERENCES users(id),
    UNIQUE(user_id, permission_id)
);

-- Insert default roles
INSERT INTO roles (id, name, description) VALUES
    (1, 'admin', 'Administrator with full access'),
    (2, 'moderator', 'Forum moderator'),
    (3, 'member', 'Regular member'),
    (4, 'banned', 'Banned user')
ON CONFLICT DO NOTHING;

-- Update roles sequence
SELECT setval(pg_get_serial_sequence('roles', 'id'), 
             (SELECT COALESCE(MAX(id), 0) + 1 FROM roles), false);

-- Insert default permissions
INSERT INTO permissions (id, name, category, description) VALUES
    (1, 'forum.new-thread', 'forum', 'Create new forum threads'),
    (2, 'forum.edit-thread', 'forum', 'Edit forum threads'),
    (3, 'forum.delete-thread', 'forum', 'Delete forum threads'),
    (4, 'forum.new-post', 'forum', 'Create new forum posts'),
    (5, 'forum.edit-post', 'forum', 'Edit forum posts'),
    (6, 'forum.delete-post', 'forum', 'Delete forum posts'),
    (7, 'forum.moderate', 'forum', 'Moderate forums'),
    (8, 'user.manage-roles', 'user', 'Manage user roles'),
    (9, 'user.manage-permissions', 'user', 'Manage user permissions'),
    (10, 'store.purchase', 'store', 'Purchase items from store')
ON CONFLICT DO NOTHING;

-- Update permissions sequence
SELECT setval(pg_get_serial_sequence('permissions', 'id'), 
             (SELECT COALESCE(MAX(id), 0) + 1 FROM permissions), false);

-- Assign permissions to roles
INSERT INTO role_permissions (role_id, permission_id) VALUES
    -- Members can create posts and threads
    (3, 1),
    (3, 4),
    (3, 10),
    
    -- Moderators have all forum permissions
    (2, 1),
    (2, 2),
    (2, 3),
    (2, 4),
    (2, 5),
    (2, 6),
    (2, 7),
    
    -- Admins have all permissions
    (1, 1),
    (1, 2),
    (1, 3),
    (1, 4),
    (1, 5),
    (1, 6),
    (1, 7),
    (1, 8),
    (1, 9),
    (1, 10)
ON CONFLICT DO NOTHING;
