CREATE TABLE IF NOT EXISTS user_wallet_transactions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount INTEGER NOT NULL, -- in cents
    type TEXT NOT NULL, -- "credit" | "debit"
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_wallet_user_id ON user_wallet_transactions(user_id);
