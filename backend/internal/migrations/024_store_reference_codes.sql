CREATE TABLE IF NOT EXISTS store_reference_codes (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    incentive_amount BIGINT NOT NULL CHECK (incentive_amount > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_store_reference_codes_user_id ON store_reference_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_store_reference_codes_active ON store_reference_codes(is_active);

CREATE TABLE IF NOT EXISTS store_reference_code_payouts (
    id BIGSERIAL PRIMARY KEY,
    reference_code_id BIGINT NOT NULL REFERENCES store_reference_codes(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_store_reference_code_payouts_user_id ON store_reference_code_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_reference_code_payouts_code_id ON store_reference_code_payouts(reference_code_id);
