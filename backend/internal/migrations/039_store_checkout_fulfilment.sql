-- Retry-safe checkout identity, one payment per order, guarded durable
-- fulfilment delivery, and worker lease recovery.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM payments GROUP BY order_id HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'payment uniqueness migration stopped: duplicate order payments require review';
    END IF;
    IF EXISTS (
        SELECT 1 FROM payments
        WHERE provider_ref IS NOT NULL AND provider_ref <> ''
        GROUP BY provider, provider_ref HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'payment uniqueness migration stopped: duplicate provider references require review';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_order_once ON payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref
    ON payments(provider, provider_ref) WHERE provider_ref IS NOT NULL AND provider_ref <> '';

CREATE TABLE IF NOT EXISTS store_checkout_operations (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    key_hash        TEXT NOT NULL,
    payload_hash    TEXT NOT NULL,
    order_id        BIGINT UNIQUE REFERENCES orders(id),
    status          TEXT NOT NULL DEFAULT 'started'
                    CHECK (status IN ('started', 'completed')),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, key_hash)
);
CREATE INDEX IF NOT EXISTS idx_store_checkout_operations_updated
    ON store_checkout_operations(status, updated_at);

CREATE TABLE IF NOT EXISTS store_payment_events (
    id              BIGSERIAL PRIMARY KEY,
    provider        TEXT NOT NULL,
    event_id_hash   TEXT NOT NULL,
    payload_hash    TEXT NOT NULL,
    provider_ref    TEXT NOT NULL,
    payment_status  TEXT NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, event_id_hash)
);
CREATE INDEX IF NOT EXISTS idx_store_payment_events_ref
    ON store_payment_events(provider, provider_ref);

CREATE TABLE IF NOT EXISTS store_order_fulfilments (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id),
    order_item_id   BIGINT NOT NULL REFERENCES order_items(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    action_index    INT NOT NULL CHECK (action_index >= 0),
    action_type     TEXT NOT NULL CHECK (action_type IN ('role', 'credit')),
    action_value    TEXT NOT NULL,
    quantity        INT NOT NULL CHECK (quantity > 0),
    payload_hash    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
    attempts        INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_owner     TEXT,
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    last_error      TEXT,
    delivered_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (order_item_id, action_index)
);
CREATE INDEX IF NOT EXISTS idx_store_order_fulfilments_claim
    ON store_order_fulfilments(status, available_at, lease_expires_at, id);
CREATE INDEX IF NOT EXISTS idx_store_order_fulfilments_order
    ON store_order_fulfilments(order_id, status);

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'store_checkout_operations','store_payment_events','store_order_fulfilments'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS skaia_reject_hard_delete ON %I', table_name);
        EXECUTE format(
            'CREATE TRIGGER skaia_reject_hard_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_skaia_hard_delete()',
            table_name
        );
    END LOOP;
END $$;
