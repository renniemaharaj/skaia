
-- Migration: Move existing admin user to superuser group (for legacy DBs)

-- Assign admin user to superuser role if not already present
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'admin' AND r.name = 'superuser'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'admin' AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Optionally remove admin from old admin role (uncomment if desired)
-- DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE username = 'admin') AND role_id = (SELECT id FROM roles WHERE name = 'admin');
