package analytics

import (
	"database/sql"

	"github.com/skaia/backend/models"
)

// Repository persists and queries resource views.
type Repository struct {
	db *sql.DB
}

// NewRepository creates a Repository backed by the given database.
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// RecordView inserts a single resource view row.
func (r *Repository) RecordView(resource string, resourceID int64, userID *int64, ip string) error {
	var uid sql.NullInt64
	if userID != nil {
		uid = sql.NullInt64{Int64: *userID, Valid: true}
	}
	_, err := r.db.Exec(
		`INSERT INTO resource_views (resource, resource_id, user_id, ip)
		 VALUES ($1, $2, $3, $4)`,
		resource, resourceID, uid, ip,
	)
	return err
}

// DailyStats returns per-day view statistics for a given resource in the last N days.
func (r *Repository) DailyStats(resource string, resourceID int64, days int) ([]*models.ViewStat, error) {
	rows, err := r.db.Query(`
		SELECT
			d::date::text                              AS date,
			COUNT(rv.id)                               AS views,
			COUNT(DISTINCT rv.ip)   FILTER (WHERE rv.ip IS NOT NULL AND rv.ip <> '')  AS unique_ips,
			COUNT(DISTINCT rv.user_id) FILTER (WHERE rv.user_id IS NOT NULL)          AS unique_users
		FROM generate_series(
			CURRENT_DATE - ($3 - 1) * INTERVAL '1 day',
			CURRENT_DATE,
			'1 day'
		) AS d
		LEFT JOIN resource_views rv
			ON rv.resource    = $1
			AND rv.resource_id = $2
			AND rv.created_at >= d
			AND rv.created_at <  d + INTERVAL '1 day'
		GROUP BY d
		ORDER BY d`,
		resource, resourceID, days,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []*models.ViewStat
	for rows.Next() {
		s := &models.ViewStat{}
		if err := rows.Scan(&s.Date, &s.Views, &s.UniqueIPs, &s.UniqueUsers); err != nil {
			return nil, err
		}
		stats = append(stats, s)
	}
	return stats, rows.Err()
}

// TotalViews returns the lifetime view count for a resource.
func (r *Repository) TotalViews(resource string, resourceID int64) (int64, error) {
	var count int64
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM resource_views WHERE resource = $1 AND resource_id = $2`,
		resource, resourceID,
	).Scan(&count)
	return count, err
}

// UniqueViewers returns the lifetime unique user count for a resource.
func (r *Repository) UniqueViewers(resource string, resourceID int64) (int64, error) {
	var count int64
	err := r.db.QueryRow(
		`SELECT COUNT(DISTINCT user_id) FROM resource_views
		 WHERE resource = $1 AND resource_id = $2 AND user_id IS NOT NULL`,
		resource, resourceID,
	).Scan(&count)
	return count, err
}

// UniqueIPs returns the lifetime distinct IP count for a resource.
func (r *Repository) UniqueIPs(resource string, resourceID int64) (int64, error) {
	var count int64
	err := r.db.QueryRow(
		`SELECT COUNT(DISTINCT ip) FROM resource_views
		 WHERE resource = $1 AND resource_id = $2 AND ip IS NOT NULL AND ip <> ''`,
		resource, resourceID,
	).Scan(&count)
	return count, err
}

// RecentVisitors returns individual visit rows, newest first, with optional user info.
// If identifiedOnly is true, only rows with a non-null user_id are returned.
func (r *Repository) RecentVisitors(resource string, resourceID int64, limit, offset int, identifiedOnly bool) ([]*models.VisitorEntry, error) {
	extraWhere := ""
	if identifiedOnly {
		extraWhere = " AND rv.user_id IS NOT NULL"
	}
	rows, err := r.db.Query(`
		SELECT rv.id, rv.ip, rv.user_id, u.username, u.display_name, u.avatar_url, rv.created_at
		FROM resource_views rv
		LEFT JOIN users u ON u.id = rv.user_id
		WHERE rv.resource = $1 AND rv.resource_id = $2`+extraWhere+`
		ORDER BY rv.created_at DESC
		LIMIT $3 OFFSET $4`,
		resource, resourceID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var visitors []*models.VisitorEntry
	for rows.Next() {
		v := &models.VisitorEntry{}
		var ip sql.NullString
		if err := rows.Scan(&v.ID, &ip, &v.UserID, &v.Username, &v.DisplayName, &v.AvatarURL, &v.CreatedAt); err != nil {
			return nil, err
		}
		if ip.Valid {
			v.IP = ip.String
		}
		visitors = append(visitors, v)
	}
	return visitors, rows.Err()
}
