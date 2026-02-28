-- Insert default forum categories
INSERT INTO forum_categories (id, name, description, display_order) VALUES
  (1, 'General Discussion', 'Talk about anything related to our community', 1),
  (2, 'Support', 'Get help with server issues', 2),
  (3, 'Events & Competitions', 'Participate in community events', 3)
ON CONFLICT (name) DO NOTHING;

-- Insert welcome threads using the admin user ID
DO $$
DECLARE
  admin_id BIGINT;
  general_id BIGINT;
BEGIN
  SELECT id INTO admin_id FROM users WHERE username = 'admin' LIMIT 1;
  SELECT id INTO general_id FROM forum_categories WHERE name = 'General Discussion' LIMIT 1;
  
  IF admin_id IS NOT NULL AND general_id IS NOT NULL THEN
    INSERT INTO forum_threads (category_id, user_id, title, content, view_count, reply_count)
    VALUES
      (
        general_id,
        admin_id,
        'Welcome to the forum!',
        'Welcome to our community forum! This is a place where we can discuss topics related to our server, share ideas, and help each other out. Feel free to introduce yourself and let us know what you''re interested in.',
        234,
        12
      ),
      (
        general_id,
        admin_id,
        'Server updates and news',
        'Stay tuned for the latest updates and news about our server. We''re constantly working on improvements and new features to enhance your experience.',
        189,
        8
      )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
