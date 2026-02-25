package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type StoreCategoryRepositoryImpl struct {
	db *sql.DB
}

func NewStoreCategoryRepository(db *sql.DB) StoreCategoryRepository {
	return &StoreCategoryRepositoryImpl{db: db}
}

func (r *StoreCategoryRepositoryImpl) GetCategoryByID(id uuid.UUID) (*models.StoreCategory, error) {
	category := &models.StoreCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, created_at FROM store_categories WHERE id = $1`,
		id,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("category not found")
	}
	return category, err
}

func (r *StoreCategoryRepositoryImpl) GetCategoryByName(name string) (*models.StoreCategory, error) {
	category := &models.StoreCategory{}
	err := r.db.QueryRow(
		`SELECT id, name, description, display_order, created_at FROM store_categories WHERE name = $1`,
		name,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("category not found")
	}
	return category, err
}

func (r *StoreCategoryRepositoryImpl) CreateCategory(category *models.StoreCategory) (*models.StoreCategory, error) {
	category.ID = uuid.New()

	err := r.db.QueryRow(
		`INSERT INTO store_categories (id, name, description, display_order)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, name, description, display_order, created_at`,
		category.ID, category.Name, category.Description, category.DisplayOrder,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	return category, err
}

func (r *StoreCategoryRepositoryImpl) UpdateCategory(category *models.StoreCategory) (*models.StoreCategory, error) {
	err := r.db.QueryRow(
		`UPDATE store_categories SET name = $1, description = $2, display_order = $3
		 WHERE id = $4
		 RETURNING id, name, description, display_order, created_at`,
		category.Name, category.Description, category.DisplayOrder, category.ID,
	).Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)

	return category, err
}

func (r *StoreCategoryRepositoryImpl) DeleteCategory(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM store_categories WHERE id = $1`, id)
	return err
}

func (r *StoreCategoryRepositoryImpl) ListCategories() ([]*models.StoreCategory, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, display_order, created_at FROM store_categories ORDER BY display_order ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []*models.StoreCategory
	for rows.Next() {
		category := &models.StoreCategory{}
		err := rows.Scan(&category.ID, &category.Name, &category.Description, &category.DisplayOrder, &category.CreatedAt)
		if err != nil {
			return nil, err
		}
		categories = append(categories, category)
	}

	return categories, rows.Err()
}
