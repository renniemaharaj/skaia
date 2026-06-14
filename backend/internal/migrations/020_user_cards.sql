CREATE TABLE IF NOT EXISTS user_cards (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    card_name VARCHAR(255) NOT NULL,
    card_description VARCHAR(255),
    card_type VARCHAR(50) NOT NULL, -- 'visa', 'mastercard', etc.
    is_credit BOOLEAN NOT NULL DEFAULT FALSE, -- FALSE for debit, TRUE for credit
    card_number VARCHAR(20) NOT NULL, -- usually only store last 4, but user asked to accept details
    cvv VARCHAR(10),
    expiry_month INT,
    expiry_year INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id);
