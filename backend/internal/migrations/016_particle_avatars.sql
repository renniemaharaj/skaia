-- Add particle avatar configuration
ALTER TABLE users ADD COLUMN IF NOT EXISTS particle_avatar_config JSONB;
