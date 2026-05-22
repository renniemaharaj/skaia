package auth

import (
	"context"
	"database/sql"

	"github.com/skaia/backend/models"
)

type Repository interface {
	CreateCredential(ctx context.Context, userID int64, passwordHash string) (*models.Credential, error)
	GetCredentialByUserID(ctx context.Context, userID int64) (*models.Credential, error)
	UpdatePasswordHash(ctx context.Context, userID int64, newHash string) error

	SetTOTPSecret(ctx context.Context, userID int64, secret string) error

	CreateTOTPSecret(ctx context.Context, userID int64, secret string) (*models.TOTPSecret, error)
	GetTOTPSecretByUserID(ctx context.Context, userID int64) (*models.TOTPSecret, error)
	SetTOTPEnabled(ctx context.Context, userID int64, enabled bool) error
	GetTOTPEnabled(ctx context.Context, userID int64) (bool, error)

	CreateBackupCodes(ctx context.Context, userID int64, codeHashes []string) error
	GetBackupCodes(ctx context.Context, userID int64) ([]*models.BackupCode, error)
	UseBackupCode(ctx context.Context, codeID int64) error
	DeleteBackupCodes(ctx context.Context, userID int64) error
}

// SQLRepository implements Repository using a SQL database.
// SetTOTPSecret sets or updates the TOTP secret for a user (legacy compatibility).
func (r *SQLRepository) SetTOTPSecret(ctx context.Context, userID int64, secret string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO auth_totp_secrets (user_id, totp_secret, enabled)
		VALUES ($1, $2, false)
		ON CONFLICT (user_id) DO UPDATE SET totp_secret = EXCLUDED.totp_secret, enabled = false, updated_at = NOW()
	`, userID, secret)
	return err
}

type SQLRepository struct {
	db *sql.DB
}

func NewSQLRepository(db *sql.DB) *SQLRepository {
	return &SQLRepository{db: db}
}

// Implementations for credential, TOTP, and backup code methods will go here.
// Credential methods
func (r *SQLRepository) CreateCredential(ctx context.Context, userID int64, passwordHash string) (*models.Credential, error) {
	row := r.db.QueryRowContext(ctx, `INSERT INTO auth_credentials (user_id, password_hash) VALUES ($1, $2) RETURNING id, user_id, password_hash, created_at, updated_at`, userID, passwordHash)
	cred := &models.Credential{}
	if err := row.Scan(&cred.ID, &cred.UserID, &cred.PasswordHash, &cred.CreatedAt, &cred.UpdatedAt); err != nil {
		return nil, err
	}
	return cred, nil
}

func (r *SQLRepository) GetCredentialByUserID(ctx context.Context, userID int64) (*models.Credential, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, user_id, password_hash, created_at, updated_at FROM auth_credentials WHERE user_id = $1`, userID)
	cred := &models.Credential{}
	if err := row.Scan(&cred.ID, &cred.UserID, &cred.PasswordHash, &cred.CreatedAt, &cred.UpdatedAt); err != nil {
		return nil, err
	}
	return cred, nil
}

func (r *SQLRepository) UpdatePasswordHash(ctx context.Context, userID int64, newHash string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE auth_credentials SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`, newHash, userID)
	return err
}

// TOTP methods
func (r *SQLRepository) CreateTOTPSecret(ctx context.Context, userID int64, secret string) (*models.TOTPSecret, error) {
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO auth_totp_secrets (user_id, totp_secret, enabled)
		VALUES ($1, $2, false)
		ON CONFLICT (user_id) DO UPDATE SET totp_secret = EXCLUDED.totp_secret, enabled = false, updated_at = NOW()
		RETURNING id, user_id, totp_secret, enabled, created_at, updated_at
	`, userID, secret)
	t := &models.TOTPSecret{}
	if err := row.Scan(&t.ID, &t.UserID, &t.Secret, &t.Enabled, &t.CreatedAt, &t.UpdatedAt); err != nil {
		return nil, err
	}
	return t, nil
}

func (r *SQLRepository) GetTOTPSecretByUserID(ctx context.Context, userID int64) (*models.TOTPSecret, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, user_id, totp_secret, enabled, created_at, updated_at FROM auth_totp_secrets WHERE user_id = $1`, userID)
	t := &models.TOTPSecret{}
	if err := row.Scan(&t.ID, &t.UserID, &t.Secret, &t.Enabled, &t.CreatedAt, &t.UpdatedAt); err != nil {
		return nil, err
	}
	return t, nil
}

func (r *SQLRepository) SetTOTPEnabled(ctx context.Context, userID int64, enabled bool) error {
	_, err := r.db.ExecContext(ctx, `UPDATE auth_totp_secrets SET enabled = $1, updated_at = NOW() WHERE user_id = $2`, enabled, userID)
	return err
}

func (r *SQLRepository) GetTOTPEnabled(ctx context.Context, userID int64) (bool, error) {
	row := r.db.QueryRowContext(ctx, `SELECT enabled FROM auth_totp_secrets WHERE user_id = $1`, userID)
	var enabled bool
	if err := row.Scan(&enabled); err != nil {
		return false, err
	}
	return enabled, nil
}

// Backup code methods
func (r *SQLRepository) CreateBackupCodes(ctx context.Context, userID int64, codeHashes []string) error {
	for _, h := range codeHashes {
		_, err := r.db.ExecContext(ctx, `INSERT INTO auth_backup_codes (user_id, code_hash) VALUES ($1, $2)`, userID, h)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *SQLRepository) GetBackupCodes(ctx context.Context, userID int64) ([]*models.BackupCode, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, user_id, code_hash, used, created_at FROM auth_backup_codes WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var codes []*models.BackupCode
	for rows.Next() {
		c := &models.BackupCode{}
		if err := rows.Scan(&c.ID, &c.UserID, &c.CodeHash, &c.Used, &c.CreatedAt); err != nil {
			return nil, err
		}
		codes = append(codes, c)
	}
	return codes, rows.Err()
}

func (r *SQLRepository) UseBackupCode(ctx context.Context, codeID int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE auth_backup_codes SET used = true WHERE id = $1`, codeID)
	return err
}

func (r *SQLRepository) DeleteBackupCodes(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM auth_backup_codes WHERE user_id = $1`, userID)
	return err
}
