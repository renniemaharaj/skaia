-- Add default green color for superuser
UPDATE roles
SET theme_color = '#5b9e8e'
WHERE name = 'superuser' AND theme_color IS NULL;
