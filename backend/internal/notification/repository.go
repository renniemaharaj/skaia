package notification

import (
	"database/sql"
	"errors"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by db.
func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) Create(n *models.Notification) (*models.Notification, error) {
	err := r.db.QueryRow(
		`INSERT INTO notifications (user_id, type, message, route)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, user_id, type, message, route, is_read, created_at`,
		n.UserID, n.Type, n.Message, n.Route,
	).Scan(&n.ID, &n.UserID, &n.Type, &n.Message, &n.Route, &n.IsRead, &n.CreatedAt)
	return n, err
}

func (r *sqlRepository) GetByUser(userID int64, limit, offset int) ([]*models.Notification, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, type, message, route, is_read, created_at
		 FROM notifications
		 WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.Notification
	for rows.Next() {
		n := &models.Notification{}
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Message, &n.Route, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *sqlRepository) MarkRead(id, userID int64) error {
	res, err := r.db.Exec(
		`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("notification not found")
	}
	return nil
}

func (r *sqlRepository) MarkAllRead(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE notifications SET is_read = TRUE WHERE user_id = $1`, userID,
	)
	return err
}

func (r *sqlRepository) Delete(id, userID int64) error {
	res, err := r.db.Exec(
		`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, id, userID,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("notification not found")
	}
	return nil
}

func (r *sqlRepository) DeleteAll(userID int64) error {
	_, err := r.db.Exec(`DELETE FROM notifications WHERE user_id = $1`, userID)
	return err
}

func (r *sqlRepository) UnreadCount(userID int64) (int, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`, userID,
	).Scan(&count)
	return count, err
}
