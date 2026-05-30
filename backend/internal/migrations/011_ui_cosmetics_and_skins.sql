-- Add cosmetics fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_video_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_position VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS font_family VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_card_art_url TEXT;

-- Add cosmetics fields to roles
ALTER TABLE roles ADD COLUMN IF NOT EXISTS theme_color VARCHAR(50);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS glow_color VARCHAR(50);
