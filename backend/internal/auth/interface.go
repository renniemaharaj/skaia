package auth

import (
	"context"

	"github.com/skaia/backend/models"
)

type AuthService interface {
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
