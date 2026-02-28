-- 006_create_default_admin.sql
-- Create a default admin user for initial setup
-- Note: Default password is "password123"
-- To generate a new hash: Use bcrypt.GenerateFromPassword in Go

-- Only insert if no admin user exists
INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at)
SELECT 
  1,
  'admin',
  'admin@skaiacraft.local',
  -- Password: password123 (bcrypt hash)
  '$2a$10$5rGYDGGQ32l5bhO5m0uph.Xr11UMG2ox9eDBEFAYJRQyccw7FWYEG',
  'Administrator',
  '',
  '',
  '',
  'Default administrator account',
  NULL,
  FALSE,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin'
);

-- Assign admin role to the default admin user
INSERT INTO user_roles (user_id, role_id)
SELECT 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = 1 AND role_id = 1
);
