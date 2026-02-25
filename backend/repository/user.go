package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type UserRepositoryImpl struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &UserRepositoryImpl{db: db}
}

func (r *UserRepositoryImpl) GetUserByID(id uuid.UUID) (*models.User, error) {
	user := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, username, email, password_hash, display_name, avatar_url, created_at, updated_at 
		 FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("user not found")
	}
	return user, err
}

func (r *UserRepositoryImpl) GetUserByUsername(username string) (*models.User, error) {
	user := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, username, email, password_hash, display_name, avatar_url, created_at, updated_at 
		 FROM users WHERE username = $1`,
		username,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("user not found")
	}
	return user, err
}

func (r *UserRepositoryImpl) GetUserByEmail(email string) (*models.User, error) {
	user := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, username, email, password_hash, display_name, avatar_url, created_at, updated_at 
		 FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("user not found")
	}
	return user, err
}

func (r *UserRepositoryImpl) CreateUser(user *models.User, passwordHash string) (*models.User, error) {
	user.ID = uuid.New()

	err := r.db.QueryRow(
		`INSERT INTO users (id, username, email, password_hash, display_name, avatar_url)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, username, email, password_hash, display_name, avatar_url, created_at, updated_at`,
		user.ID, user.Username, user.Email, passwordHash, user.DisplayName, user.AvatarURL,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)

	return user, err
}

func (r *UserRepositoryImpl) UpdateUser(user *models.User) (*models.User, error) {
	err := r.db.QueryRow(
		`UPDATE users SET display_name = $1, avatar_url = $2, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $3
		 RETURNING id, username, email, password_hash, display_name, avatar_url, created_at, updated_at`,
		user.DisplayName, user.AvatarURL, user.ID,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)

	return user, err
}

func (r *UserRepositoryImpl) DeleteUser(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM users WHERE id = $1`, id)
	return err
}

func (r *UserRepositoryImpl) ListUsers(limit int, offset int) ([]*models.User, error) {
	rows, err := r.db.Query(
		`SELECT id, username, email, password_hash, display_name, avatar_url, created_at, updated_at
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
		err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, rows.Err()
}
