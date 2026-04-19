-- Add env_data column to data_sources (idempotent).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'data_sources' AND column_name = 'env_data'
    ) THEN
        ALTER TABLE data_sources ADD COLUMN env_data TEXT NOT NULL DEFAULT '';
    END IF;
END
$$;

-- Drop the legacy page_env_vars table if it exists.
DROP TABLE IF EXISTS page_env_vars;
