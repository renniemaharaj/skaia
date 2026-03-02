-- 010_create_thread_comment_likes.sql
-- Create table to track likes on thread comments

CREATE TABLE IF NOT EXISTS thread_comment_likes (
    id BIGSERIAL PRIMARY KEY,
    thread_comment_id BIGINT NOT NULL REFERENCES thread_comments(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(thread_comment_id, user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_thread_comment_likes_comment_id ON thread_comment_likes(thread_comment_id);
CREATE INDEX IF NOT EXISTS idx_thread_comment_likes_user_id ON thread_comment_likes(user_id);
