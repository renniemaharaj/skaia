INSERT INTO permissions(name,category,description) VALUES
 ('community.publication-edit','community','Edit community publications owned by other users'),
 ('community.publication-delete','community','Delete community publications owned by other users')
ON CONFLICT(name) DO NOTHING;

UPDATE permissions
SET description='Moderate proposal decisions and managed community workflows'
WHERE name='community.manage';

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r,permissions p
WHERE r.name IN ('admin','superuser')
  AND p.name IN ('community.publication-edit','community.publication-delete')
ON CONFLICT DO NOTHING;
