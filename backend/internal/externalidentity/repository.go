package externalidentity

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type SQLRepository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *SQLRepository { return &SQLRepository{db: db} }

const providerColumns = `id, key, name, adapter_key, enabled, public_display_allowed, created_at`
const linkColumns = `l.id, l.provider_id, p.key, p.name, l.user_id, l.subject, l.display_name, l.public, l.verified_at, l.reverified_at, l.unlinked_at`

func scanProvider(row interface{ Scan(...any) error }) (*Provider, error) {
	var provider Provider
	if err := row.Scan(&provider.ID, &provider.Key, &provider.Name, &provider.AdapterKey, &provider.Enabled, &provider.PublicDisplayAllowed, &provider.CreatedAt); err != nil {
		return nil, err
	}
	return &provider, nil
}

func scanLink(row interface{ Scan(...any) error }) (*Link, error) {
	var link Link
	if err := row.Scan(&link.ID, &link.ProviderID, &link.ProviderKey, &link.Provider, &link.UserID, &link.Subject, &link.DisplayName, &link.Public, &link.VerifiedAt, &link.Reverified, &link.UnlinkedAt); err != nil {
		return nil, err
	}
	return &link, nil
}

func (r *SQLRepository) ListProviders(ctx context.Context) ([]Provider, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+providerColumns+` FROM external_identity_providers WHERE enabled AND deleted_at IS NULL ORDER BY name, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	providers := make([]Provider, 0)
	for rows.Next() {
		provider, err := scanProvider(rows)
		if err != nil {
			return nil, err
		}
		providers = append(providers, *provider)
	}
	return providers, rows.Err()
}

func (r *SQLRepository) GetProvider(ctx context.Context, key string) (*Provider, error) {
	return scanProvider(r.db.QueryRowContext(ctx, `SELECT `+providerColumns+` FROM external_identity_providers WHERE key=$1 AND enabled AND deleted_at IS NULL`, key))
}

func (r *SQLRepository) CreateProvider(ctx context.Context, actorID int64, request CreateProviderRequest) (*Provider, error) {
	return scanProvider(r.db.QueryRowContext(ctx, `INSERT INTO external_identity_providers (key,name,adapter_key,enabled,public_display_allowed,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING `+providerColumns, request.Key, request.Name, request.AdapterKey, request.Enabled, request.PublicDisplayAllowed, actorID))
}

func (r *SQLRepository) CreateChallenge(ctx context.Context, providerID, userID int64, tokenHash, sessionHash []byte, subject, displayName string, expiresAt time.Time) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO external_identity_challenges (provider_id,user_id,token_hash,session_hash,subject,display_name,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, providerID, userID, tokenHash, sessionHash, subject, displayName, expiresAt)
	return err
}

func (r *SQLRepository) GetChallenge(ctx context.Context, tokenHash []byte) (*Challenge, error) {
	var challenge Challenge
	err := r.db.QueryRowContext(ctx, `SELECT c.id,c.provider_id,p.key,p.adapter_key,c.user_id,c.token_hash,c.session_hash,c.subject,c.display_name,c.expires_at,c.consumed_at FROM external_identity_challenges c JOIN external_identity_providers p ON p.id=c.provider_id WHERE c.token_hash=$1 AND p.enabled AND p.deleted_at IS NULL`, tokenHash).Scan(&challenge.ID, &challenge.ProviderID, &challenge.ProviderKey, &challenge.AdapterKey, &challenge.UserID, &challenge.TokenHash, &challenge.SessionHash, &challenge.Subject, &challenge.DisplayName, &challenge.ExpiresAt, &challenge.ConsumedAt)
	return &challenge, err
}

func (r *SQLRepository) CompleteChallenge(ctx context.Context, tokenHash []byte, actorID int64, now time.Time) (*Link, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var challenge Challenge
	err = tx.QueryRowContext(ctx, `SELECT id,provider_id,user_id,subject,display_name,expires_at,consumed_at FROM external_identity_challenges WHERE token_hash=$1 FOR UPDATE`, tokenHash).Scan(&challenge.ID, &challenge.ProviderID, &challenge.UserID, &challenge.Subject, &challenge.DisplayName, &challenge.ExpiresAt, &challenge.ConsumedAt)
	if err != nil {
		return nil, err
	}
	if challenge.ConsumedAt != nil || !now.Before(challenge.ExpiresAt) || challenge.UserID != actorID {
		return nil, ErrChallengeInvalid
	}
	if _, err = tx.ExecContext(ctx, `UPDATE external_identity_challenges SET consumed_at=$1 WHERE id=$2 AND consumed_at IS NULL`, now, challenge.ID); err != nil {
		return nil, err
	}
	var existingID int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM external_identity_links WHERE user_id=$1 AND provider_id=$2 AND unlinked_at IS NULL FOR UPDATE`, actorID, challenge.ProviderID).Scan(&existingID)
	action := "linked"
	if err == nil {
		action = "reverified"
		_, err = tx.ExecContext(ctx, `UPDATE external_identity_links SET subject=$1,display_name=$2,verified_at=$3,reverified_at=$3,updated_at=$3 WHERE id=$4`, challenge.Subject, challenge.DisplayName, now, existingID)
	} else if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, `INSERT INTO external_identity_links (provider_id,user_id,subject,display_name,verified_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`, challenge.ProviderID, actorID, challenge.Subject, challenge.DisplayName, now).Scan(&existingID)
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO external_identity_events (link_id,provider_id,user_id,actor_id,action) VALUES ($1,$2,$3,$3,$4)`, existingID, challenge.ProviderID, actorID, action); err != nil {
		return nil, err
	}
	link, err := scanLink(tx.QueryRowContext(ctx, `SELECT `+linkColumns+` FROM external_identity_links l JOIN external_identity_providers p ON p.id=l.provider_id WHERE l.id=$1`, existingID))
	if err != nil {
		return nil, err
	}
	return link, tx.Commit()
}

func (r *SQLRepository) listLinks(ctx context.Context, userID int64, publicOnly bool) ([]Link, error) {
	filter := ""
	if publicOnly {
		filter = " AND l.public AND p.public_display_allowed"
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+linkColumns+` FROM external_identity_links l JOIN external_identity_providers p ON p.id=l.provider_id WHERE l.user_id=$1 AND l.unlinked_at IS NULL AND p.enabled AND p.deleted_at IS NULL`+filter+` ORDER BY p.name,l.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	links := make([]Link, 0)
	for rows.Next() {
		link, err := scanLink(rows)
		if err != nil {
			return nil, err
		}
		links = append(links, *link)
	}
	return links, rows.Err()
}

func (r *SQLRepository) ListOwn(ctx context.Context, userID int64) ([]Link, error) {
	return r.listLinks(ctx, userID, false)
}
func (r *SQLRepository) ListPublic(ctx context.Context, userID int64) ([]Link, error) {
	return r.listLinks(ctx, userID, true)
}

func (r *SQLRepository) SetVisibility(ctx context.Context, userID, linkID int64, public bool) (*Link, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	link, err := scanLink(tx.QueryRowContext(ctx, `UPDATE external_identity_links l SET public=$1,updated_at=NOW() FROM external_identity_providers p WHERE l.id=$2 AND l.user_id=$3 AND l.unlinked_at IS NULL AND p.id=l.provider_id AND (NOT $1 OR p.public_display_allowed) RETURNING `+linkColumns, public, linkID, userID))
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO external_identity_events (link_id,provider_id,user_id,actor_id,action) VALUES ($1,$2,$3,$3,'visibility_changed')`, link.ID, link.ProviderID, userID); err != nil {
		return nil, err
	}
	return link, tx.Commit()
}

func (r *SQLRepository) Unlink(ctx context.Context, userID, linkID int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var providerID int64
	if err = tx.QueryRowContext(ctx, `UPDATE external_identity_links SET unlinked_at=NOW(),public=FALSE,updated_at=NOW() WHERE id=$1 AND user_id=$2 AND unlinked_at IS NULL RETURNING provider_id`, linkID, userID).Scan(&providerID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO external_identity_events (link_id,provider_id,user_id,actor_id,action) VALUES ($1,$2,$3,$3,'unlinked')`, linkID, providerID, userID); err != nil {
		return err
	}
	return tx.Commit()
}
