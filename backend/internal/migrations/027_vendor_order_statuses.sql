-- Migration 027: vendor-level store order fulfillment.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_status VARCHAR(50) NOT NULL DEFAULT 'pending';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_note TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vendor_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_order_items_vendor_status ON order_items(vendor_status);

UPDATE roles
SET name = 'Vendor',
    description = COALESCE(NULLIF(description, ''), 'Can post and manage owned store products')
WHERE name = 'store-seller'
  AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Vendor');

DO $$
DECLARE
    old_role_id BIGINT;
    vendor_role_id BIGINT;
BEGIN
    SELECT id INTO old_role_id FROM roles WHERE name = 'store-seller' LIMIT 1;
    SELECT id INTO vendor_role_id FROM roles WHERE name = 'Vendor' LIMIT 1;

    IF old_role_id IS NOT NULL AND vendor_role_id IS NOT NULL AND old_role_id <> vendor_role_id THEN
        INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
        SELECT user_id, vendor_role_id, assigned_at, assigned_by
        FROM user_roles
        WHERE role_id = old_role_id
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT vendor_role_id, permission_id
        FROM role_permissions
        WHERE role_id = old_role_id
        ON CONFLICT DO NOTHING;

        DELETE FROM user_roles WHERE role_id = old_role_id;
        DELETE FROM role_permissions WHERE role_id = old_role_id;
        DELETE FROM roles WHERE id = old_role_id;
    END IF;
END $$;

UPDATE roles
SET description = COALESCE(NULLIF(description, ''), 'Can post and manage owned store products')
WHERE name = 'Vendor';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Vendor'
  AND p.name IN ('store.product-seller', 'store.product-new')
ON CONFLICT DO NOTHING;
