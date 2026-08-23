ALTER TABLE user_wallet_transactions
    ADD COLUMN IF NOT EXISTS operation_scope TEXT,
    ADD COLUMN IF NOT EXISTS operation_key_hash TEXT,
    ADD COLUMN IF NOT EXISTS operation_payload_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallet_operation_once
    ON user_wallet_transactions (user_id, operation_scope, operation_key_hash)
    WHERE operation_scope IS NOT NULL AND operation_key_hash IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_wallet_transactions_positive_amount'
    ) THEN
        ALTER TABLE user_wallet_transactions
            ADD CONSTRAINT user_wallet_transactions_positive_amount
            CHECK (amount > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_wallet_transactions_known_type'
    ) THEN
        ALTER TABLE user_wallet_transactions
            ADD CONSTRAINT user_wallet_transactions_known_type
            CHECK (type IN ('credit', 'debit')) NOT VALID;
    END IF;
END $$;
