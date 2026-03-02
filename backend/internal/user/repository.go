package user

import (
	"database/sql"
	"errors"

	"github.com/skaia/backend/models"
)

type sqlRepository struct {
	db *sql.DB
}

// NewRepository returns a SQL-backed Repository.
func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

// --- internal helpers ---

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

	var roles []string
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
	var perms []string
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
                  bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at`

func scanUser(row interface {
	Scan(dest ...any) error
}) (*models.User, error) {
	u := &models.User{}
	err := row.Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.DisplayName,
		&u.AvatarURL, &u.BannerURL, &u.PhotoURL, &u.Bio, &u.DiscordID,
		&u.IsSuspended, &u.SuspendedAt, &u.SuspendedReason, &u.CreatedAt, &u.UpdatedAt,
	)
	return u, err
}

// --- Repository interface ---

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

	// Assign default "member" role (role_id = 3)
	if _, err = r.db.Exec(
		`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
		inserted.ID, int64(3),
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
	rows, err := r.db.Query(`SELECT id, name, COALESCE(description, ''), created_at FROM roles ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []*models.Role
	for rows.Next() {
		ro := &models.Role{}
		if err := rows.Scan(&ro.ID, &ro.Name, &ro.Description, &ro.CreatedAt); err != nil {
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
