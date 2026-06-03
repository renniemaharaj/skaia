-- Migration: Set default branding color for superuser role

UPDATE roles
SET theme_color = '#5b9e8e'
WHERE name = 'superuser' AND (theme_color IS NULL OR theme_color = '');
