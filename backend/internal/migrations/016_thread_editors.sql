-- Add last_edited_by to forum_threads
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS last_edited_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- Create thread_editors junction table to track everyone who has edited the thread
CREATE TABLE IF NOT EXISTS thread_editors (
    thread_id BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_editors_thread ON thread_editors(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_editors_user ON thread_editors(user_id);
