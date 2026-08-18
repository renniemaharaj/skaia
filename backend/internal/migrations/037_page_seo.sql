-- Optional, page-specific search and social metadata. Empty fields deliberately
-- fall back to content-derived metadata and then the official site metadata.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS seo_image TEXT NOT NULL DEFAULT '';
