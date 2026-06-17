ALTER TABLE products ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_owner_id ON products(owner_id);

UPDATE products
SET media = jsonb_build_array(jsonb_build_object(
    'url', image_url,
    'filename', regexp_replace(image_url, '^.*/', ''),
    'mime_type', '',
    'type', 'image',
    'size', 0,
    'created_at', created_at
))
WHERE COALESCE(image_url, '') <> ''
  AND (media IS NULL OR media = '[]'::jsonb);

INSERT INTO permissions (name, category, description) VALUES
    ('store.product-seller', 'store', 'Create and manage owned store products and owned product orders')
ON CONFLICT DO NOTHING;

INSERT INTO roles (name, description, power_level, theme_color) VALUES
    ('store-seller', 'Can post and manage owned store products', 10, '#0f766e')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'store-seller'
  AND p.name IN ('store.product-seller', 'store.product-new')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('admin', 'superuser')
  AND p.name = 'store.product-seller'
ON CONFLICT DO NOTHING;
