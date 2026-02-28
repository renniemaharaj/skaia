package repository

import (
	"database/sql"
	"errors"

	"github.com/skaia/backend/models"
)

type UserRepositoryImpl struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &UserRepositoryImpl{db: db}
}

// getUserWithRolesAndPermissions loads a user along with their roles and permissions
func (r *UserRepositoryImpl) getUserWithRolesAndPermissions(user *models.User) error {
	// Load roles
	rows, err := r.db.Query(
		`SELECT r.name FROM roles r
		 JOIN user_roles ur ON r.id = ur.role_id
		 WHERE ur.user_id = $1`,
		user.ID,
	)
	if err != nil && err != sql.ErrNoRows {
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

	// Load direct permissions
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
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	defer permRows.Close()

	var permissions []string
	seen := make(map[string]bool)
	for permRows.Next() {
		var perm string
		if err := permRows.Scan(&perm); err != nil {
			return err
		}
		if !seen[perm] {
			permissions = append(permissions, perm)
			seen[perm] = true
		}
	}
	user.Permissions = permissions

	return nil
}

func (r *UserRepositoryImpl) GetUserByID(id int64) (*models.User, error) {
	user := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, 
		        bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at 
		 FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL,
		&user.BannerURL, &user.PhotoURL, &user.Bio, &user.DiscordID, &user.IsSuspended,
		&user.SuspendedAt, &user.SuspendedReason, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("user not found")
	}
	if err != nil {
		return nil, err
	}

	if err := r.getUserWithRolesAndPermissions(user); err != nil {
		return nil, err
	}

	return user, nil
}

func (r *UserRepositoryImpl) GetUserByUsername(username string) (*models.User, error) {
	user := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, 
		        bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at 
		 FROM users WHERE username = $1`,
		username,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL,
		&user.BannerURL, &user.PhotoURL, &user.Bio, &user.DiscordID, &user.IsSuspended,
		&user.SuspendedAt, &user.SuspendedReason, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("user not found")
	}
	if err != nil {
		return nil, err
	}

	if err := r.getUserWithRolesAndPermissions(user); err != nil {
		return nil, err
	}

	return user, nil
}

func (r *UserRepositoryImpl) GetUserByEmail(email string) (*models.User, error) {
	user := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, 
		        bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at 
		 FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL,
		&user.BannerURL, &user.PhotoURL, &user.Bio, &user.DiscordID, &user.IsSuspended,
		&user.SuspendedAt, &user.SuspendedReason, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("user not found")
	}
	if err != nil {
		return nil, err
	}

	if err := r.getUserWithRolesAndPermissions(user); err != nil {
		return nil, err
	}

	return user, nil
}

func (r *UserRepositoryImpl) Create(user *models.User) error {
	err := r.db.QueryRow(
		`INSERT INTO users (username, email, password_hash, display_name, avatar_url, 
		                   banner_url, photo_url, bio, discord_id, is_suspended, suspended_at, suspended_reason)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, 
		          bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at`,
		user.Username, user.Email, user.PasswordHash, user.DisplayName, user.AvatarURL,
		user.BannerURL, user.PhotoURL, user.Bio, user.DiscordID, user.IsSuspended, user.SuspendedAt, user.SuspendedReason,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL,
		&user.BannerURL, &user.PhotoURL, &user.Bio, &user.DiscordID, &user.IsSuspended,
		&user.SuspendedAt, &user.SuspendedReason, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return err
	}

	// Assign default member role
	_, err = r.db.Exec(
		`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
		user.ID, int64(3),
	)
	if err != nil {
		return err
	}

	user.Roles = []string{"member"}
	return r.getUserWithRolesAndPermissions(user)
}

func (r *UserRepositoryImpl) CreateUser(user *models.User, passwordHash string) (*models.User, error) {
	user.PasswordHash = passwordHash

	err := r.db.QueryRow(
		`INSERT INTO users (username, email, password_hash, display_name, avatar_url, 
		                   banner_url, photo_url, bio, discord_id, is_suspended, suspended_at, suspended_reason)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, 
		          bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at`,
		user.Username, user.Email, user.PasswordHash, user.DisplayName, user.AvatarURL,
		user.BannerURL, user.PhotoURL, user.Bio, user.DiscordID, user.IsSuspended, user.SuspendedAt, user.SuspendedReason,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL,
		&user.BannerURL, &user.PhotoURL, &user.Bio, &user.DiscordID, &user.IsSuspended,
		&user.SuspendedAt, &user.SuspendedReason, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, err
	}

	// Assign default member role
	_, err = r.db.Exec(
		`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
		user.ID, int64(3),
	)
	if err != nil {
		return nil, err
	}

	user.Roles = []string{"member"}
	return user, r.getUserWithRolesAndPermissions(user)
}

func (r *UserRepositoryImpl) Update(user *models.User) error {
	_, err := r.db.Exec(
		`UPDATE users SET display_name = $1, avatar_url = $2, banner_url = $3, photo_url = $4, 
		              bio = $5, discord_id = $6, is_suspended = $7, suspended_at = $8, 
		              suspended_reason = $9, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $10`,
		user.DisplayName, user.AvatarURL, user.BannerURL, user.PhotoURL, user.Bio, user.DiscordID,
		user.IsSuspended, user.SuspendedAt, user.SuspendedReason, user.ID,
	)

	return err
}

func (r *UserRepositoryImpl) UpdateUser(user *models.User) (*models.User, error) {
	err := r.Update(user)
	if err != nil {
		return nil, err
	}

	return r.GetUserByID(user.ID)
}

func (r *UserRepositoryImpl) DeleteUser(id int64) error {
	_, err := r.db.Exec(`DELETE FROM users WHERE id = $1`, id)
	return err
}

func (r *UserRepositoryImpl) ListUsers(limit int, offset int) ([]*models.User, error) {
	rows, err := r.db.Query(
		`SELECT id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, 
		        bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at
		 FROM users LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL,
			&user.BannerURL, &user.PhotoURL, &user.Bio, &user.DiscordID, &user.IsSuspended,
			&user.SuspendedAt, &user.SuspendedReason, &user.CreatedAt, &user.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if err := r.getUserWithRolesAndPermissions(user); err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, rows.Err()
}

// AddRole adds a role to a user
func (r *UserRepositoryImpl) AddRole(userID int64, roleID int64) error {
	_, err := r.db.Exec(
		`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`,
		userID, roleID,
	)
	return err
}

// RemoveRole removes a role from a user
func (r *UserRepositoryImpl) RemoveRole(userID int64, roleID int64) error {
	_, err := r.db.Exec(
		`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`,
		userID, roleID,
	)
	return err
}

// HasPermission checks if a user has a specific permission
func (r *UserRepositoryImpl) HasPermission(userID int64, permission string) (bool, error) {
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

// SearchUsers searches for users by username or email
func (r *UserRepositoryImpl) SearchUsers(query string, limit int, offset int) ([]*models.User, error) {
	query = "%" + query + "%"
	rows, err := r.db.Query(
		`SELECT id, username, email, password_hash, display_name, avatar_url, banner_url, photo_url, 
		        bio, discord_id, is_suspended, suspended_at, suspended_reason, created_at, updated_at 
		 FROM users 
		 WHERE username ILIKE $1 OR email ILIKE $1 OR display_name ILIKE $1
		 LIMIT $2 OFFSET $3`,
		query, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL,
			&user.BannerURL, &user.PhotoURL, &user.Bio, &user.DiscordID, &user.IsSuspended,
			&user.SuspendedAt, &user.SuspendedReason, &user.CreatedAt, &user.UpdatedAt)
		if err != nil {
			return nil, err
		}

		if err := r.getUserWithRolesAndPermissions(user); err != nil {
			return nil, err
		}

		users = append(users, user)
	}

	return users, nil
}

// AddPermission adds a permission to a user
func (r *UserRepositoryImpl) AddPermission(userID int64, permissionName string) error {
	var permissionID int64
	err := r.db.QueryRow(
		`SELECT id FROM permissions WHERE name = $1`,
		permissionName,
	).Scan(&permissionID)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(
		`INSERT INTO user_permissions (user_id, permission_id)
		 VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`,
		userID, permissionID,
	)
	return err
}

// RemovePermission removes a permission from a user
func (r *UserRepositoryImpl) RemovePermission(userID int64, permissionName string) error {
	var permissionID int64
	err := r.db.QueryRow(
		`SELECT id FROM permissions WHERE name = $1`,
		permissionName,
	).Scan(&permissionID)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(
		`DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2`,
		userID, permissionID,
	)
	return err
}

// GetAllPermissions returns all available permissions
func (r *UserRepositoryImpl) GetAllPermissions() ([]*models.Permission, error) {
	rows, err := r.db.Query(
		`SELECT id, name, category, description, created_at FROM permissions ORDER BY category, name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var permissions []*models.Permission
	for rows.Next() {
		perm := &models.Permission{}
		err := rows.Scan(&perm.ID, &perm.Name, &perm.Category, &perm.Description, &perm.CreatedAt)
		if err != nil {
			return nil, err
		}
		permissions = append(permissions, perm)
	}

	return permissions, nil
}
