package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type ForumCategoryRepositoryImpl struct {
	db *sql.DB
}

func NewForumCategoryRepository(db *sql.DB) ForumCategoryRepository {
	return &ForumCategoryRepositoryImpl{db: db}
}

func (r *ForumCategoryRepositoryImpl) GetCategoryByID(id uuid.UUID) (*models.ForumCategory, error) {
	category := &models.ForumCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, created_at FROM forum_categories WHERE id = $1`,
		id,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("category not found")
	}
	return category, err
}

func (r *ForumCategoryRepositoryImpl) GetCategoryByName(name string) (*models.ForumCategory, error) {
	category := &models.ForumCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, created_at FROM forum_categories WHERE name = $1`,
		name,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("category not found")
	}
	return category, err
}

func (r *ForumCategoryRepositoryImpl) CreateCategory(category *models.ForumCategory) (*models.ForumCategory, error) {
	category.ID = uuid.New()

	err := r.db.QueryRow(
		`INSERT INTO forum_categories (id, name, description, display_order)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, name, description, display_order, created_at`,
		category.ID, category.Name, category.Description, category.DisplayOrder,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	return category, err
}

func (r *ForumCategoryRepositoryImpl) UpdateCategory(category *models.ForumCategory) (*models.ForumCategory, error) {
	err := r.db.QueryRow(
		`UPDATE forum_categories SET name = $1, description = $2, display_order = $3
		 WHERE id = $4
		 RETURNING id, name, description, display_order, created_at`,
		category.Name, category.Description, category.DisplayOrder, category.ID,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	return category, err
}

func (r *ForumCategoryRepositoryImpl) DeleteCategory(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM forum_categories WHERE id = $1`, id)
	return err
}

func (r *ForumCategoryRepositoryImpl) ListCategories() ([]*models.ForumCategory, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, display_order, created_at FROM forum_categories ORDER BY display_order ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []*models.ForumCategory
	for rows.Next() {
		category := &models.ForumCategory{}
		err := rows.Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)
		if err != nil {
			return nil, err
		}
		categories = append(categories, category)
	}

	return categories, rows.Err()
}
