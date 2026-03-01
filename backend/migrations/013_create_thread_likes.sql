-- Create thread_likes table for tracking which users liked which threads
CREATE TABLE IF NOT EXISTS thread_likes (
    id BIGSERIAL PRIMARY KEY,
    thread_id BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(thread_id, user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_thread_likes_thread_id ON thread_likes(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_likes_user_id ON thread_likes(user_id);
