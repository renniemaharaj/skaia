package events

import (
	"database/sql"
	"strconv"

	"github.com/skaia/backend/models"
)

// Repository persists events to the database.
type Repository struct {
	db *sql.DB
}

// NewRepository returns a Repository backed by the given database handle.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// Insert writes a single event row.
func (r *Repository) Insert(userID *int64, activity, resource string, resourceID *int64, meta, ip string) error {
	_, err := r.db.Exec(
		`INSERT INTO events (user_id, activity, resource, resource_id, meta, ip)
		 VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		userID, activity, resource, resourceID, meta, ip,
	)
	return err
}

// buildWhere appends optional filter clauses and returns the query, args, and next param index.
func buildWhere(base string, userID *int64, activity, resource string) (string, []interface{}, int) {
	query := base
	args := []interface{}{}
	idx := 1

	if userID != nil {
		query += " AND user_id = $" + strconv.Itoa(idx)
		args = append(args, *userID)
		idx++
	}
	if activity != "" {
		query += " AND activity = $" + strconv.Itoa(idx)
		args = append(args, activity)
		idx++
	}
	if resource != "" {
		query += " AND resource = $" + strconv.Itoa(idx)
		args = append(args, resource)
		idx++
	}
	return query, args, idx
}

// Count returns the total number of events matching the filters.
func (r *Repository) Count(userID *int64, activity, resource string) (int, error) {
	query, args, _ := buildWhere(`SELECT COUNT(*) FROM events WHERE 1=1`, userID, activity, resource)
	var total int
	err := r.db.QueryRow(query, args...).Scan(&total)
	return total, err
}

// List returns the most recent events, with optional filters. Results include username+avatar via JOIN.
func (r *Repository) List(limit, offset int, userID *int64, activity, resource string) ([]*models.Event, error) {
	base := `SELECT e.id, e.user_id, COALESCE(u.username,''), COALESCE(u.avatar_url,''),
	                e.activity, e.resource, e.resource_id, e.meta, e.ip, e.created_at
	         FROM events e LEFT JOIN users u ON e.user_id = u.id WHERE 1=1`

	query, args, idx := buildWhere(base, userID, activity, resource)
	query += " ORDER BY created_at DESC LIMIT $" + strconv.Itoa(idx) + " OFFSET $" + strconv.Itoa(idx+1)
	args = append(args, limit, offset)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		e := &models.Event{}
		var uid, rid sql.NullInt64
		if err := rows.Scan(&e.ID, &uid, &e.Username, &e.AvatarURL,
			&e.Activity, &e.Resource, &rid, &e.Meta, &e.IP, &e.CreatedAt); err != nil {
			return nil, err
		}
		if uid.Valid {
			e.UserID = &uid.Int64
		}
		if rid.Valid {
			e.ResourceID = &rid.Int64
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
