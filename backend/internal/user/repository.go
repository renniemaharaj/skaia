package user

import (
	"database/sql"
	"errors"
	"math"

	"github.com/skaia/backend/models"
)

type sqlRepository struct {
	db *sql.DB
}

// NewRepository returns a SQL-backed Repository.
func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) loadRolesAndPermissions(user *models.User) error {
	// Roles
	rows, err := r.db.Query(
		`SELECT r.name FROM roles r
		 JOIN user_roles ur ON r.id = ur.role_id
		 WHERE ur.user_id = $1`,
		user.ID,
	)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	defer rows.Close()

	roles := []string{}
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return err
		}
		roles = append(roles, role)
	}
	user.Roles = roles

	// Permissions (direct + via roles)
	permRows, err := r.db.Query(
		`SELECT p.name FROM permissions p
		 JOIN user_permissions up ON p.id = up.permission_id
		 WHERE up.user_id = $1
		 UNION
		 SELECT p.name FROM permissions p
		 JOIN role_permissions rp ON p.id = rp.permission_id
		 JOIN user_roles ur ON rp.role_id = ur.role_id
		 WHERE ur.user_id = $1`,
		user.ID,
	)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	defer permRows.Close()

	seen := make(map[string]bool)
	perms := []string{}
	for permRows.Next() {
		var p string
		if err := permRows.Scan(&p); err != nil {
			return err
		}
		if !seen[p] {
			perms = append(perms, p)
			seen[p] = true
		}
	}
	user.Permissions = perms
	return nil
}

const scanCols = `id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url,
                  bio, discord_id, is_suspended, suspended_at, suspended_reason,
                  email_verified, email_verified_at, totp_secret, totp_enabled,
                  created_at, updated_at`

func scanUser(row interface {
	Scan(dest ...any) error
}) (*models.User, error) {
	u := &models.User{}
	err := row.Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.DisplayName,
		&u.AvatarURL, &u.BannerURL, &u.PhotoURL, &u.Bio, &u.DiscordID,
		&u.IsSuspended, &u.SuspendedAt, &u.SuspendedReason,
		&u.EmailVerified, &u.EmailVerifiedAt, &u.TOTPSecret, &u.TOTPEnabled,
		&u.CreatedAt, &u.UpdatedAt,
	)
	return u, err
}

func (r *sqlRepository) GetByID(id int64) (*models.User, error) {
	user, err := scanUser(r.db.QueryRow(
		`SELECT `+scanCols+` FROM users WHERE id = $1`, id,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("user not found")
	}
	if err != nil {
		return nil, err
	}
	return user, r.loadRolesAndPermissions(user)
}

func (r *sqlRepository) GetByUsername(username string) (*models.User, error) {
	user, err := scanUser(r.db.QueryRow(
		`SELECT `+scanCols+` FROM users WHERE username = $1`, username,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("user not found")
	}
	if err != nil {
		return nil, err
	}
	return user, r.loadRolesAndPermissions(user)
}

func (r *sqlRepository) GetByEmail(email string) (*models.User, error) {
	user, err := scanUser(r.db.QueryRow(
		`SELECT `+scanCols+` FROM users WHERE email = $1`, email,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("user not found")
	}
	if err != nil {
		return nil, err
	}
	return user, r.loadRolesAndPermissions(user)
}

func (r *sqlRepository) Create(user *models.User, passwordHash string) (*models.User, error) {
	user.PasswordHash = passwordHash

	inserted, err := scanUser(r.db.QueryRow(
		`INSERT INTO users
		   (username, email, password_hash, display_name, avatar_url,
		    banner_url, photo_url, bio, discord_id, is_suspended, suspended_at, suspended_reason)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		 RETURNING `+scanCols,
		user.Username, user.Email, user.PasswordHash, user.DisplayName,
		user.AvatarURL, user.BannerURL, user.PhotoURL, user.Bio, user.DiscordID,
		user.IsSuspended, user.SuspendedAt, user.SuspendedReason,
	))
	if err != nil {
		return nil, err
	}

	// Assign default "member" role (looked up by name so it is immune to ID changes)
	if _, err = r.db.Exec(
		`INSERT INTO user_roles (user_id, role_id)
		 SELECT $1, id FROM roles WHERE name = 'member' LIMIT 1`,
		inserted.ID,
	); err != nil {
		return nil, err
	}

	inserted.Roles = []string{"member"}
	return inserted, r.loadRolesAndPermissions(inserted)
}

func (r *sqlRepository) Update(user *models.User) (*models.User, error) {
	_, err := r.db.Exec(
		`UPDATE users
		 SET display_name=$1, avatar_url=$2, banner_url=$3, photo_url=$4,
		     bio=$5, discord_id=$6, is_suspended=$7, suspended_at=$8,
		     suspended_reason=$9, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$10`,
		user.DisplayName, user.AvatarURL, user.BannerURL, user.PhotoURL,
		user.Bio, user.DiscordID, user.IsSuspended, user.SuspendedAt, user.SuspendedReason,
		user.ID,
	)
	if err != nil {
		return nil, err
	}
	return r.GetByID(user.ID)
}

func (r *sqlRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM users WHERE id = $1`, id)
	return err
}

func (r *sqlRepository) List(limit, offset int) ([]*models.User, error) {
	rows, err := r.db.Query(
		`SELECT `+scanCols+` FROM users LIMIT $1 OFFSET $2`, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		if err := r.loadRolesAndPermissions(u); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *sqlRepository) Search(query string, limit, offset int) ([]*models.User, error) {
	like := "%" + query + "%"
	rows, err := r.db.Query(
		`SELECT `+scanCols+`
		 FROM users
		 WHERE username ILIKE $1 OR email ILIKE $1 OR display_name ILIKE $1
		 LIMIT $2 OFFSET $3`,
		like, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		if err := r.loadRolesAndPermissions(u); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *sqlRepository) AddRole(userID, roleID int64) error {
	_, err := r.db.Exec(
		`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, roleID,
	)
	return err
}

func (r *sqlRepository) RemoveRole(userID, roleID int64) error {
	_, err := r.db.Exec(
		`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`,
		userID, roleID,
	)
	return err
}

func (r *sqlRepository) AddRoleByName(userID int64, roleName string) error {
	var roleID int64
	if err := r.db.QueryRow(`SELECT id FROM roles WHERE name = $1`, roleName).Scan(&roleID); err != nil {
		return err
	}
	_, err := r.db.Exec(
		`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, roleID,
	)
	return err
}

func (r *sqlRepository) RemoveRoleByName(userID int64, roleName string) error {
	var roleID int64
	if err := r.db.QueryRow(`SELECT id FROM roles WHERE name = $1`, roleName).Scan(&roleID); err != nil {
		return err
	}
	_, err := r.db.Exec(
		`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`,
		userID, roleID,
	)
	return err
}

func (r *sqlRepository) GetAllRoles() ([]*models.Role, error) {
	rows, err := r.db.Query(`SELECT id, name, COALESCE(description, ''), power_level, created_at FROM roles ORDER BY power_level DESC, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []*models.Role
	for rows.Next() {
		ro := &models.Role{}
		if err := rows.Scan(&ro.ID, &ro.Name, &ro.Description, &ro.PowerLevel, &ro.CreatedAt); err != nil {
			return nil, err
		}
		roles = append(roles, ro)
	}
	return roles, rows.Err()
}

func (r *sqlRepository) Suspend(userID int64, reason string) error {
	_, err := r.db.Exec(
		`UPDATE users SET is_suspended=TRUE, suspended_at=CURRENT_TIMESTAMP, suspended_reason=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
		reason, userID,
	)
	return err
}

func (r *sqlRepository) Unsuspend(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE users SET is_suspended=FALSE, suspended_at=NULL, suspended_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
		userID,
	)
	return err
}

func (r *sqlRepository) UpdatePasswordHash(userID int64, newHash string) error {
	_, err := r.db.Exec(
		`UPDATE users SET password_hash=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
		newHash, userID,
	)
	return err
}

func (r *sqlRepository) HasPermission(userID int64, permission string) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM (
		     SELECT 1 FROM user_permissions up
		     JOIN permissions p ON up.permission_id = p.id
		     WHERE up.user_id = $1 AND p.name = $2
		     UNION
		     SELECT 1 FROM role_permissions rp
		     JOIN permissions p ON rp.permission_id = p.id
		     JOIN user_roles ur ON rp.role_id = ur.role_id
		     WHERE ur.user_id = $1 AND p.name = $2
		 ) AS perms`,
		userID, permission,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *sqlRepository) AddPermission(userID int64, permissionName string) error {
	var permID int64
	// Upsert: create the permission row if it doesn't exist yet, then return its id.
	if err := r.db.QueryRow(
		`INSERT INTO permissions (name) VALUES ($1)
		 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`,
		permissionName,
	).Scan(&permID); err != nil {
		return err
	}
	_, err := r.db.Exec(
		`INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		userID, permID,
	)
	return err
}

func (r *sqlRepository) RemovePermission(userID int64, permissionName string) error {
	var permID int64
	if err := r.db.QueryRow(
		`SELECT id FROM permissions WHERE name = $1`, permissionName,
	).Scan(&permID); err != nil {
		return err
	}
	_, err := r.db.Exec(
		`DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2`,
		userID, permID,
	)
	return err
}

func (r *sqlRepository) GetAllPermissions() ([]*models.Permission, error) {
	rows, err := r.db.Query(
		`SELECT id, name, category, description, created_at
		 FROM permissions ORDER BY category, name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []*models.Permission
	for rows.Next() {
		p := &models.Permission{}
		if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, rows.Err()
}

func (r *sqlRepository) GetUserMaxPowerLevel(userID int64) (int, error) {
	var level int
	err := r.db.QueryRow(
		`SELECT COALESCE(MAX(ro.power_level), 0)
		 FROM roles ro
		 JOIN user_roles ur ON ro.id = ur.role_id
		 WHERE ur.user_id = $1`,
		userID,
	).Scan(&level)
	return level, err
}

func (r *sqlRepository) IsSuperUserVotedOut(targetID int64) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM superuser_demotion_votes WHERE target_id = $1`,
		targetID,
	).Scan(&count)
	if err != nil {
		return false, err
	}

	threshold := max(2, int(math.Floor(float64(count)/2))+1) // Example threshold: more than 50% of superusers must vote to demote
	return count >= threshold, nil
}

func (r *sqlRepository) NewDistinctSuperuserDemotionVote(actorID, targetID int64) error {
	_, err := r.db.Exec(
		`INSERT INTO superuser_demotion_votes (actor_id, target_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		actorID, targetID,
	)

	return err
}

func (r *sqlRepository) GetAllDistinctSuperusers() ([]*models.User, error) {
	rows, err := r.db.Query(
		`SELECT DISTINCT u.id, u.username, u.email, u.display_name, u.is_suspended, u.suspended_reason, u.created_at
		 FROM users u
		 JOIN user_roles ur ON u.id = ur.user_id
		 JOIN roles r ON ur.role_id = r.id
		 WHERE r.name = 'superuser'`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u := &models.User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.IsSuspended, &u.SuspendedReason, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *sqlRepository) GetRoleByID(id int64) (*models.Role, error) {
	ro := &models.Role{}
	err := r.db.QueryRow(
		`SELECT id, name, COALESCE(description, ''), power_level, created_at FROM roles WHERE id = $1`, id,
	).Scan(&ro.ID, &ro.Name, &ro.Description, &ro.PowerLevel, &ro.CreatedAt)
	if err != nil {
		return nil, err
	}
	return ro, nil
}

func (r *sqlRepository) CreateRole(name, description string, powerLevel int) (*models.Role, error) {
	ro := &models.Role{}
	err := r.db.QueryRow(
		`INSERT INTO roles (name, description, power_level)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, COALESCE(description, ''), power_level, created_at`,
		name, description, powerLevel,
	).Scan(&ro.ID, &ro.Name, &ro.Description, &ro.PowerLevel, &ro.CreatedAt)
	return ro, err
}

func (r *sqlRepository) UpdateRole(id int64, name, description string, powerLevel int) (*models.Role, error) {
	_, err := r.db.Exec(
		`UPDATE roles SET name=$1, description=$2, power_level=$3 WHERE id=$4`,
		name, description, powerLevel, id,
	)
	if err != nil {
		return nil, err
	}
	return r.GetRoleByID(id)
}

func (r *sqlRepository) DeleteRole(id int64) error {
	_, err := r.db.Exec(`DELETE FROM roles WHERE id = $1`, id)
	return err
}

func (r *sqlRepository) GetRolePermissions(roleID int64) ([]*models.Permission, error) {
	rows, err := r.db.Query(
		`SELECT p.id, p.name, COALESCE(p.category, ''), COALESCE(p.description, ''), p.created_at
		 FROM permissions p
		 JOIN role_permissions rp ON p.id = rp.permission_id
		 WHERE rp.role_id = $1
		 ORDER BY p.category, p.name`,
		roleID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []*models.Permission
	for rows.Next() {
		p := &models.Permission{}
		if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, rows.Err()
}

func (r *sqlRepository) AddPermissionToRole(roleID int64, permissionName string) error {
	var permID int64
	if err := r.db.QueryRow(
		`INSERT INTO permissions (name) VALUES ($1)
		 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`,
		permissionName,
	).Scan(&permID); err != nil {
		return err
	}
	_, err := r.db.Exec(
		`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		roleID, permID,
	)
	return err
}

func (r *sqlRepository) RemovePermissionFromRole(roleID int64, permissionName string) error {
	_, err := r.db.Exec(
		`DELETE FROM role_permissions
		 WHERE role_id = $1
		   AND permission_id = (SELECT id FROM permissions WHERE name = $2)`,
		roleID, permissionName,
	)
	return err
}

// ── Email verification ─────────────────────────────────────────────────────

func (r *sqlRepository) CreateEmailVerificationToken(userID int64, token string, expiresAt interface{}) error {
	_, err := r.db.Exec(
		`INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
		userID, token, expiresAt,
	)
	return err
}

func (r *sqlRepository) GetEmailVerificationToken(token string) (*models.EmailVerificationToken, error) {
	t := &models.EmailVerificationToken{}
	err := r.db.QueryRow(
		`SELECT id, user_id, token, expires_at, created_at
		 FROM email_verification_tokens WHERE token = $1`, token,
	).Scan(&t.ID, &t.UserID, &t.Token, &t.ExpiresAt, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (r *sqlRepository) MarkEmailVerified(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE users SET email_verified = true, email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		userID,
	)
	return err
}

func (r *sqlRepository) DeleteEmailVerificationTokens(userID int64) error {
	_, err := r.db.Exec(`DELETE FROM email_verification_tokens WHERE user_id = $1`, userID)
	return err
}

// ── Password reset ─────────────────────────────────────────────────────────

func (r *sqlRepository) CreatePasswordResetToken(userID int64, token string, expiresAt interface{}) error {
	_, err := r.db.Exec(
		`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
		userID, token, expiresAt,
	)
	return err
}

func (r *sqlRepository) GetPasswordResetToken(token string) (*models.PasswordResetToken, error) {
	t := &models.PasswordResetToken{}
	err := r.db.QueryRow(
		`SELECT id, user_id, token, expires_at, used, created_at
		 FROM password_reset_tokens WHERE token = $1`, token,
	).Scan(&t.ID, &t.UserID, &t.Token, &t.ExpiresAt, &t.Used, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (r *sqlRepository) MarkPasswordResetTokenUsed(tokenID int64) error {
	_, err := r.db.Exec(`UPDATE password_reset_tokens SET used = true WHERE id = $1`, tokenID)
	return err
}

func (r *sqlRepository) DeletePasswordResetTokens(userID int64) error {
	_, err := r.db.Exec(`DELETE FROM password_reset_tokens WHERE user_id = $1`, userID)
	return err
}

// ── TOTP / 2FA ─────────────────────────────────────────────────────────────

func (r *sqlRepository) SetTOTPSecret(userID int64, secret string) error {
	_, err := r.db.Exec(
		`UPDATE users SET totp_secret = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
		secret, userID,
	)
	return err
}

func (r *sqlRepository) EnableTOTP(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE users SET totp_enabled = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		userID,
	)
	return err
}

func (r *sqlRepository) DisableTOTP(userID int64) error {
	_, err := r.db.Exec(
		`UPDATE users SET totp_enabled = false, totp_secret = '', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		userID,
	)
	return err
}

func (r *sqlRepository) CreateTOTPBackupCodes(userID int64, codeHashes []string) error {
	for _, h := range codeHashes {
		if _, err := r.db.Exec(
			`INSERT INTO totp_backup_codes (user_id, code_hash) VALUES ($1, $2)`,
			userID, h,
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *sqlRepository) GetTOTPBackupCodes(userID int64) ([]*models.TOTPBackupCode, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, code_hash, used FROM totp_backup_codes WHERE user_id = $1 ORDER BY id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var codes []*models.TOTPBackupCode
	for rows.Next() {
		c := &models.TOTPBackupCode{}
		if err := rows.Scan(&c.ID, &c.UserID, &c.CodeHash, &c.Used); err != nil {
			return nil, err
		}
		codes = append(codes, c)
	}
	return codes, rows.Err()
}

func (r *sqlRepository) UseTOTPBackupCode(codeID int64) error {
	_, err := r.db.Exec(`UPDATE totp_backup_codes SET used = true WHERE id = $1`, codeID)
	return err
}

func (r *sqlRepository) DeleteTOTPBackupCodes(userID int64) error {
	_, err := r.db.Exec(`DELETE FROM totp_backup_codes WHERE user_id = $1`, userID)
	return err
}
