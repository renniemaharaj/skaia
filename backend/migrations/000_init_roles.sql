-- Initialize roles and basic database setup
-- This file must be run first (alphabetically before other migrations)

-- Create the application user if it doesn't exist
DO $$ BEGIN
  CREATE ROLE skaia_user WITH LOGIN PASSWORD 'skaia_password';
EXCEPTION WHEN DUPLICATE_OBJECT THEN
  -- Role already exists, updating password
  ALTER ROLE skaia_user PASSWORD 'skaia_password';
END $$;

-- Grant privileges to skaia_user
GRANT ALL PRIVILEGES ON DATABASE skaia TO skaia_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO skaia_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO skaia_user;
