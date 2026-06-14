-- Migration 020: Store Orders Additions

ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE orders 
    ADD COLUMN is_guest BOOLEAN DEFAULT FALSE,
    ADD COLUMN guest_email VARCHAR(255),
    ADD COLUMN guest_phone VARCHAR(50),
    ADD COLUMN delivery_location TEXT,
    ADD COLUMN delivery_date TIMESTAMP,
    ADD COLUMN delivery_time VARCHAR(100),
    ADD COLUMN extra_info TEXT,
    ADD COLUMN billing_info TEXT;

CREATE INDEX idx_orders_guest_email ON orders(guest_email);
CREATE INDEX idx_orders_guest_phone ON orders(guest_phone);
