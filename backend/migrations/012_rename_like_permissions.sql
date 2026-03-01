-- Rename like permissions to use unified naming
-- Drop old permissions if they exist
DELETE FROM role_permissions 
WHERE permission_id IN (SELECT id FROM permissions WHERE name LIKE 'threads.canLike%');

DELETE FROM permissions WHERE name LIKE 'threads.canLike%';

-- Add unified like and delete permissions
INSERT INTO permissions (name, category, description) VALUES
  ('thread.canLikeComments', 'forum', 'Can like forum comments'),
  ('thread.canDeleteThreadComment', 'forum', 'Can delete own comments or any comment if admin'),
  ('thread.canLikeThreads', 'forum', 'Can like forum threads')
ON CONFLICT (name) DO NOTHING;

-- Assign like permissions to member role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE name = 'member' LIMIT 1),
  id
FROM permissions 
WHERE name IN ('thread.canLikeComments', 'thread.canLikeThreads', 'thread.canDeleteThreadComment')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign like permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE name = 'admin' LIMIT 1),
  id
FROM permissions 
WHERE name IN ('thread.canLikeComments', 'thread.canLikeThreads', 'thread.canDeleteThreadComment')
ON CONFLICT (role_id, permission_id) DO NOTHING;
