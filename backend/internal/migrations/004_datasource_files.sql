-- Add files JSONB column to data_sources (idempotent).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'data_sources' AND column_name = 'files'
    ) THEN
        ALTER TABLE data_sources ADD COLUMN files JSONB NOT NULL DEFAULT '{}';
        -- Migrate existing code into files as {"main.ts": <code>}
        UPDATE data_sources SET files = jsonb_build_object('main.ts', code)
        WHERE code != '' AND (files = '{}' OR files IS NULL);
    END IF;
END
$$;
