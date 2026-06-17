package session

import (
	"context"
	"time"

	"github.com/skaia/backend/database"
)

// Repository defines the data-access contract for sessions.
type Repository interface {
	Create(ctx context.Context, s *Session) (*Session, error)
	GetByID(ctx context.Context, id string) (*Session, error)
	GetByUserID(ctx context.Context, userID int64) ([]*Session, error)
	UpdateLastSeenIP(ctx context.Context, id, ip string) error
	MarkVerified(ctx context.Context, id string) error
	DeleteByID(ctx context.Context, id string) error
	DeleteByUserID(ctx context.Context, userID int64) error
	DeleteExpired(ctx context.Context) (int64, error)
}

// SQLRepository implements Repository using PostgreSQL.
type SQLRepository struct {
	db database.Executor
}

// NewSQLRepository returns a new SQLRepository backed by db.
func NewSQLRepository(db database.Executor) *SQLRepository {
	return &SQLRepository{db: db}
}

func (r *SQLRepository) Create(ctx context.Context, s *Session) (*Session, error) {
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO sessions (id, user_id, created_ip, last_seen_ip, user_agent_hash, issued_at, expires_at, verified)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, user_id, created_ip, last_seen_ip, user_agent_hash, issued_at, expires_at, verified, created_at, updated_at`,
		s.ID, s.UserID, s.CreatedIP, s.LastSeenIP, s.UserAgentHash,
		s.IssuedAt, s.ExpiresAt, s.Verified,
	)
	out := &Session{}
	if err := row.Scan(
		&out.ID, &out.UserID, &out.CreatedIP, &out.LastSeenIP,
		&out.UserAgentHash, &out.IssuedAt, &out.ExpiresAt,
		&out.Verified, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *SQLRepository) GetByID(ctx context.Context, id string) (*Session, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, created_ip, last_seen_ip, user_agent_hash,
		       issued_at, expires_at, verified, created_at, updated_at
		FROM sessions
		WHERE id = $1 AND expires_at > NOW()`, id)
	s := &Session{}
	if err := row.Scan(
		&s.ID, &s.UserID, &s.CreatedIP, &s.LastSeenIP,
		&s.UserAgentHash, &s.IssuedAt, &s.ExpiresAt,
		&s.Verified, &s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return s, nil
}

func (r *SQLRepository) GetByUserID(ctx context.Context, userID int64) ([]*Session, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, user_id, created_ip, last_seen_ip, user_agent_hash,
		       issued_at, expires_at, verified, created_at, updated_at
		FROM sessions
		WHERE user_id = $1 AND expires_at > NOW()
		ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sessions []*Session
	for rows.Next() {
		s := &Session{}
		if err := rows.Scan(
			&s.ID, &s.UserID, &s.CreatedIP, &s.LastSeenIP,
			&s.UserAgentHash, &s.IssuedAt, &s.ExpiresAt,
			&s.Verified, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

func (r *SQLRepository) UpdateLastSeenIP(ctx context.Context, id, ip string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE sessions SET last_seen_ip = $1, updated_at = NOW()
		WHERE id = $2`, ip, id)
	return err
}

func (r *SQLRepository) MarkVerified(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE sessions SET verified = true, updated_at = NOW()
		WHERE id = $1`, id)
	return err
}

func (r *SQLRepository) DeleteByID(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}

func (r *SQLRepository) DeleteByUserID(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (r *SQLRepository) DeleteExpired(ctx context.Context) (int64, error) {
	res, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= $1`, time.Now())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
