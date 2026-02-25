package repository

import (
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

type ProductRepositoryImpl struct {
	db *sql.DB
}

func NewProductRepository(db *sql.DB) ProductRepository {
	return &ProductRepositoryImpl{db: db}
}

func (r *ProductRepositoryImpl) GetProductByID(id uuid.UUID) (*models.Product, error) {
	product := &models.Product{}
	err := r.db.QueryRow(
		`SELECT id, category_id, name, description, price, image_url, stock, is_active, created_at, updated_at
		 FROM products WHERE id = $1`,
		id,
	).Scan(&product.ID, &product.CategoryID, &product.Name, &product.Description, &product.Price, &product.ImageURL, &product.Stock, &product.IsActive, &product.CreatedAt, &product.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("product not found")
	}
	return product, err
}

func (r *ProductRepositoryImpl) GetProductsByCategory(categoryID uuid.UUID, limit int, offset int) ([]*models.Product, error) {
	rows, err := r.db.Query(
		`SELECT id, category_id, name, description, price, image_url, stock, is_active, created_at, updated_at
		 FROM products WHERE category_id = $1 AND is_active = true
		 LIMIT $2 OFFSET $3`,
		categoryID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(&product.ID, &product.CategoryID, &product.Name, &product.Description, &product.Price, &product.ImageURL, &product.Stock, &product.IsActive, &product.CreatedAt, &product.UpdatedAt)
		if err != nil {
			return nil, err
		}
		products = append(products, product)
	}

	return products, rows.Err()
}

func (r *ProductRepositoryImpl) CreateProduct(product *models.Product) (*models.Product, error) {
	product.ID = uuid.New()

	err := r.db.QueryRow(
		`INSERT INTO products (id, category_id, name, description, price, image_url, stock, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, category_id, name, description, price, image_url, stock, is_active, created_at, updated_at`,
		product.ID, product.CategoryID, product.Name, product.Description, product.Price, product.ImageURL, product.Stock, product.IsActive,
	).Scan(&product.ID, &product.CategoryID, &product.Name, &product.Description, &product.Price, &product.ImageURL, &product.Stock, &product.IsActive, &product.CreatedAt, &product.UpdatedAt)

	return product, err
}

func (r *ProductRepositoryImpl) UpdateProduct(product *models.Product) (*models.Product, error) {
	err := r.db.QueryRow(
		`UPDATE products SET name = $1, description = $2, price = $3, image_url = $4, stock = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $7
		 RETURNING id, category_id, name, description, price, image_url, stock, is_active, created_at, updated_at`,
		product.Name, product.Description, product.Price, product.ImageURL, product.Stock, product.IsActive, product.ID,
	).Scan(&product.ID, &product.CategoryID, &product.Name, &product.Description, &product.Price, &product.ImageURL, &product.Stock, &product.IsActive, &product.CreatedAt, &product.UpdatedAt)

	return product, err
}

func (r *ProductRepositoryImpl) DeleteProduct(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM products WHERE id = $1`, id)
	return err
}

func (r *ProductRepositoryImpl) ListProducts(limit int, offset int) ([]*models.Product, error) {
	rows, err := r.db.Query(
		`SELECT id, category_id, name, description, price, image_url, stock, is_active, created_at, updated_at
		 FROM products WHERE is_active = true
		 LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(&product.ID, &product.CategoryID, &product.Name, &product.Description, &product.Price, &product.ImageURL, &product.Stock, &product.IsActive, &product.CreatedAt, &product.UpdatedAt)
		if err != nil {
			return nil, err
		}
		products = append(products, product)
	}

	return products, rows.Err()
}
