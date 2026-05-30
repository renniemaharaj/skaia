CREATE INDEX IF NOT EXISTS idx_auth_backup_codes_user_id ON auth_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_page_comment_likes_page_comment_id ON page_comment_likes(page_comment_id);
CREATE INDEX IF NOT EXISTS idx_page_comment_likes_user_id ON page_comment_likes(user_id);
