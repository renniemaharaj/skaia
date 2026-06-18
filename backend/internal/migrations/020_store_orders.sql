-- Migration 020: Store Orders Additions

ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_location TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS extra_info TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_info TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_guest_email ON orders(guest_email);
CREATE INDEX IF NOT EXISTS idx_orders_guest_phone ON orders(guest_phone);

-- User cards are intentionally folded into migration 020 to keep migration numbers unique.
CREATE TABLE IF NOT EXISTS user_cards (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    card_name VARCHAR(255) NOT NULL,
    card_description VARCHAR(255),
    card_type VARCHAR(50) NOT NULL, -- 'visa', 'mastercard', etc.
    is_credit BOOLEAN NOT NULL DEFAULT FALSE, -- FALSE for debit, TRUE for credit
    card_number VARCHAR(20) NOT NULL, -- stores last 4 only; never store full PAN
    cvv VARCHAR(10),
    expiry_month INT,
    expiry_year INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id);
