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

-- Migration 021: User Cards (solution to duplicated index)
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
