-- Add like permissions for forum comments
INSERT INTO permissions (name, description) VALUES
  ('threads.canLikeCommentOwned', 'Can like their own comments'),
  ('threads.canLikeCommentOther', 'Can like other users comments')
ON CONFLICT (name) DO NOTHING;

-- Assign like permissions to member role (assuming role_id 2 for member)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE name = 'member' LIMIT 1),
  id
FROM permissions 
WHERE name IN ('threads.canLikeCommentOwned', 'threads.canLikeCommentOther')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign like permissions to admin role (assuming role_id 1 for admin)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE name = 'admin' LIMIT 1),
  id
FROM permissions 
WHERE name IN ('threads.canLikeCommentOwned', 'threads.canLikeCommentOther')
ON CONFLICT (role_id, permission_id) DO NOTHING;
