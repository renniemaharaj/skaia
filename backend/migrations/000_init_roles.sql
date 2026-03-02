-- Initialize roles and basic database setup
-- This file must be run first (alphabetically before other migrations)

-- Create the application user if it doesn't exist
DO $$ BEGIN
  CREATE ROLE skaia_user WITH LOGIN PASSWORD 'skaia_password';
EXCEPTION WHEN DUPLICATE_OBJECT THEN
  -- Role already exists, updating password
  ALTER ROLE skaia_user PASSWORD 'skaia_password';
END $$;

-- Grant privileges to skaia_user on whichever database this migration runs in.
-- Using dynamic SQL because GRANT does not accept current_database() directly.
DO $$ BEGIN
  EXECUTE 'GRANT ALL PRIVILEGES ON DATABASE ' || quote_ident(current_database()) || ' TO skaia_user';
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO skaia_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO skaia_user;
