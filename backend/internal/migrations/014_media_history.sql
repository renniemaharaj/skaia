CREATE TABLE IF NOT EXISTS media_history (
    id SERIAL PRIMARY KEY,
    route VARCHAR(255) NOT NULL,
    video_id VARCHAR(255) NOT NULL,
    added_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    loop BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_history_route ON media_history(route);
CREATE INDEX IF NOT EXISTS idx_media_history_created_at ON media_history(created_at);
