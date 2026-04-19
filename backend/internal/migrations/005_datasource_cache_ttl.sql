-- 005: Add configurable cache TTL (in seconds) for datasource execution results.
-- 0 = no caching (default).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'data_sources' AND column_name = 'cache_ttl'
    ) THEN
        ALTER TABLE data_sources ADD COLUMN cache_ttl INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;
