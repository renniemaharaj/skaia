package ws

import (
	"database/sql"
	"time"
)

type MediaHistoryRepo struct {
	DB *sql.DB
}

func (r *MediaHistoryRepo) SaveHistory(route string, item MediaItem) (int64, error) {
	if r.DB == nil {
		return 0, nil
	}
	var id int64
	err := r.DB.QueryRow(`
		INSERT INTO media_history (route, video_id, added_by, user_name, loop, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, route, item.VideoID, item.AddedBy, item.UserName, item.Loop, item.CreatedAt).Scan(&id)
	return id, err
}

func (r *MediaHistoryRepo) LoadHistory(route string) ([]MediaItem, error) {
	if r.DB == nil {
		return []MediaItem{}, nil
	}
	rows, err := r.DB.Query(`
		SELECT id, video_id, added_by, user_name, loop, created_at
		FROM media_history
		WHERE route = $1
		ORDER BY created_at DESC
		LIMIT 50
	`, route)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []MediaItem
	for rows.Next() {
		var item MediaItem
		var addedBy sql.NullInt64
		var createdAt time.Time
		if err := rows.Scan(&item.HistoryID, &item.VideoID, &addedBy, &item.UserName, &item.Loop, &createdAt); err != nil {
			return nil, err
		}
		item.ID = generateID() // random ID for react keys
		item.AddedBy = addedBy.Int64
		item.CreatedAt = createdAt.Format(time.RFC3339)
		history = append(history, item)
	}
	return history, nil
}

func (r *MediaHistoryRepo) DeleteHistoryItem(id int64) error {
	if r.DB == nil {
		return nil
	}
	_, err := r.DB.Exec(`DELETE FROM media_history WHERE id = $1`, id)
	return err
}

func (r *MediaHistoryRepo) DeleteHistoryItemByData(route, videoID, createdAt string) error {
	if r.DB == nil {
		return nil
	}
	_, err := r.DB.Exec(`DELETE FROM media_history WHERE route = $1 AND video_id = $2 AND created_at = $3`, route, videoID, createdAt)
	return err
}

func (r *MediaHistoryRepo) ClearHistory(route string) error {
	if r.DB == nil {
		return nil
	}
	_, err := r.DB.Exec(`DELETE FROM media_history WHERE route = $1`, route)
	return err
}
